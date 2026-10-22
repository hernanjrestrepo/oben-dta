import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { WorkflowEventType } from '../../entities/workflow-event.entity';
import { Tenant } from '../../entities/tenant.entity';
import { ProformaOben, type LineaProformaOben, type PasoProformaOben } from '../../entities/proforma-oben.entity';
import { COMERCIAL_URL_PRUEBAS, type EscrituraComercial } from '../integrations/hub/adapters/oben-comercial';
import { ComercialMaestrosService } from './comercial-maestros.service';

const WORKFLOW = 'comercial';
const ESCRITURA = { maxAttempts: 1, timeoutMs: 90_000 };
const round2 = (n: number) => Math.round(n * 100) / 100;
type Fila = Record<string, unknown>;
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

export interface LineaEntrada {
  /** CodSec_Prod del maestro de referencias, o la referencia (p. ej. "ET---0012RT0600S0760"). */
  codSecProduct?: number;
  referencia?: string;
  kilos: number;
  precio: number;
  etiqueta?: string;
  numeroParte?: string;
  /** Partida (CodSec_TariffDeparture); sin ella se toma la de la línea de película de la referencia. */
  codSecTariff?: number;
}

export interface ProformaEntrada {
  /** CodSec_Entity del cliente. */
  cliente: number;
  /** CodSed_CustomerAddress del destino (fila del maestro de clientes). */
  direccion: number;
  ordenCompra: string;
  fechaEntrega: string;
  fechaDespacho: string;
  /** Mes de facturación (AAAA-MM-DD); por defecto la fecha de despacho. */
  mesFactura?: string;
  fechaSolicitudCliente?: string;
  contenedor?: string;
  pesoBruto?: number;
  notas?: string;
  notaProforma?: string;
  notaConsignado?: string;
  notaNotificado?: string;
  notaOperativa?: string;
  notaEspecial?: string;
  iva?: number;
  reteFuente?: number;
  reteIva?: number;
  documentos?: number;
  muestra?: boolean;
  tipoEnvioMuestra?: number;
  stock?: boolean;
  lineas: LineaEntrada[];
}

export interface VistaPrevia {
  servidor: 'pruebas' | 'produccion';
  simulado: boolean;
  cliente: string;
  destino: string;
  encabezado: Record<string, unknown>;
  lineas: LineaProformaOben[];
  /** Por línea: si la referencia tiene Maestro de Empaque para el cliente y su destino. */
  empaque: Array<{ referencia: string; valido: boolean; mensaje: string }>;
  avisos: string[];
  /** Lo que impide crearla (nada se envía si hay algo aquí). */
  bloqueos: string[];
}

/**
 * Crea proformas en OBEN MAS con las APIs comerciales (hoy en el servidor de PRUEBAS, ver oben-comercial.ts):
 * encabezado → detalle por línea → orden de venta → activar. Probado en vivo el 22-oct (PF 13392).
 *
 * Reglas:
 *  - Todo sale de los maestros de Oben (cliente, destino, parametrización, referencias, partidas); el usuario solo
 *    pone la orden de compra, fechas, kilos y precios. Nada se inventa.
 *  - Antes de escribir se valida el Maestro de Empaque de cada referencia; si alguna no lo tiene, no se envía nada.
 *  - Cada paso queda guardado: un reintento continúa donde quedó y nunca repite un encabezado ni una línea ya creada.
 *  - Si Oben no responde a tiempo en una escritura, queda "revisar": puede haberse hecho, se verifica antes de seguir.
 */
@Injectable()
export class ProformasObenService {
  private readonly logger = new Logger(ProformasObenService.name);

  constructor(
    private readonly hub: IntegrationHubService,
    private readonly ctx: TenantContext,
    private readonly audit: WorkflowAuditService,
    private readonly maestros: ComercialMaestrosService,
    @InjectRepository(ProformaOben) private readonly repo: Repository<ProformaOben>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
  ) {}

  async listar(): Promise<ProformaOben[]> {
    return this.repo.find({ where: { tenantId: this.ctx.tenantId }, order: { createdAt: 'DESC' }, take: 100 });
  }

  async obtener(id: string): Promise<ProformaOben> {
    const p = await this.repo.findOne({ where: { id, tenantId: this.ctx.tenantId } });
    if (!p) throw new NotFoundException('Proforma no encontrada.');
    return p;
  }

  /** Arma la proforma con los maestros de Oben y valida el empaque. No escribe nada en Oben. */
  async previsualizar(e: ProformaEntrada): Promise<VistaPrevia> {
    const bloqueos: string[] = [];
    const avisos: string[] = [];
    if (!txt(e.ordenCompra)) bloqueos.push('Falta la orden de compra del cliente.');
    if (!Array.isArray(e.lineas) || e.lineas.length === 0) bloqueos.push('Agrega al menos una línea (referencia, kilos y precio).');
    const fechaEntrega = this.fecha(e.fechaEntrega, 'fecha de entrega', bloqueos);
    const fechaDespacho = this.fecha(e.fechaDespacho, 'fecha de despacho', bloqueos);

    // Cliente y destino: la fila exacta del maestro de clientes.
    const clientes = (await this.maestros.maestro('clientes', { limite: 1000, buscar: String(e.cliente) })).items;
    const filaCliente = clientes.find((c) => Number(c.CodSec_Entity) === Number(e.cliente) && Number(c.CodSed_CustomerAddress) === Number(e.direccion));
    if (!filaCliente) {
      bloqueos.push(`El cliente ${e.cliente} no tiene el destino ${e.direccion} en el maestro de clientes de Oben.`);
    }
    const destino = txt(filaCliente?.Target_Customer ?? filaCliente?.Cliente_Destino);
    let par: Fila | null = null;
    let simulado = false;
    if (filaCliente && destino) {
      try {
        const r = await this.maestros.parametrizacion({ codSecEntity: Number(e.cliente), targetCustomer: destino });
        par = r.datos;
        simulado = r.simulado;
      } catch (err) {
        bloqueos.push(`Oben no tiene parametrización comercial para ${destino}: ${(err as Error).message}`);
      }
      if (!par) bloqueos.push(`Oben no devolvió la parametrización comercial de ${destino} (condición de pago, Incoterm, moneda, puerto).`);
    }

    // Líneas: referencia del maestro y partida de su línea de película.
    const lineas: LineaProformaOben[] = [];
    const productos = e.lineas?.length ? await this.productosDe(e.lineas) : new Map<string, Fila>();
    const partidas = (await this.maestros.maestro('partidas', { limite: 1000 })).items;
    const exporta = !/colombia/i.test(txt(par?.Pais ?? filaCliente?.Pais_Cliente));
    for (const [i, l] of (e.lineas ?? []).entries()) {
      const n = i + 1;
      const p = productos.get(l.codSecProduct ? `#${l.codSecProduct}` : txt(l.referencia).toUpperCase());
      const kilos = num(l.kilos);
      const precio = num(l.precio);
      if (!p) bloqueos.push(`Línea ${n}: la referencia ${l.referencia ?? l.codSecProduct ?? '(vacía)'} no está en el maestro de referencias de Oben.`);
      if (!kilos || kilos <= 0) bloqueos.push(`Línea ${n}: faltan los kilos.`);
      if (precio === null || precio <= 0) bloqueos.push(`Línea ${n}: falta el precio por kilo.`);
      if (!p) continue;
      const opciones = partidas.filter((t) => Number(t.CodSec_Line) === Number(p.CodSec_LineFilm) || txt(t.Linea).toUpperCase() === txt(p.Linea).toUpperCase());
      const elegida =
        (l.codSecTariff ? partidas.find((t) => Number(t.CodSec_TariffDeparture) === Number(l.codSecTariff)) : null) ??
        opciones.find((t) => (exporta ? /export/i : /nacional/i).test(txt(t.Descripcion))) ??
        opciones[0];
      if (!elegida) bloqueos.push(`Línea ${n}: Oben no tiene partida arancelaria para la línea ${txt(p.Linea)}.`);
      else if (!l.codSecTariff && opciones.length > 1) {
        avisos.push(`Línea ${n}: la línea ${txt(p.Linea)} tiene ${opciones.length} partidas en Oben; se usó ${txt(elegida.Valor)} (${txt(elegida.Descripcion)}). Cámbiala si no es la correcta.`);
      }
      lineas.push({
        codSecProduct: Number(p.CodSec_Prod),
        referencia: txt(p.Referencia),
        linea: txt(p.Linea) || null,
        kilos: kilos ?? 0,
        precio: precio ?? 0,
        codSecTariff: Number(elegida?.CodSec_TariffDeparture ?? 0),
        partida: elegida ? txt(elegida.Valor) : null,
        etiqueta: txt(l.etiqueta) || txt(par?.Nota_Etiqueta) || 'N/A',
        numeroParte: txt(l.numeroParte) || 'N/A',
        creada: false,
      });
    }

    // Maestro de Empaque por línea (si falta, Oben no deja continuar: se bloquea antes de escribir nada).
    const empaque: VistaPrevia['empaque'] = [];
    if (filaCliente && par) {
      for (const l of lineas) {
        try {
          const v = await this.maestros.validarEmpaque({
            codSecEntity: Number(e.cliente),
            codSecEntityAddress: Number(e.direccion),
            codSecProduct: l.codSecProduct,
            codSecCity: Number(par.CodSec_City),
          });
          empaque.push({ referencia: l.referencia, valido: v.valido, mensaje: v.mensaje });
          if (!v.valido) bloqueos.push(`${l.referencia}: no tiene Maestro de Empaque para ${destino}. Oben dice: "${v.mensaje}". Planeación debe crearlo antes de la proforma.`);
        } catch (err) {
          bloqueos.push(`${l.referencia}: no se pudo validar el Maestro de Empaque (${(err as Error).message}).`);
        }
      }
    }

    const subTotal = round2(lineas.reduce((a, l) => a + l.kilos * l.precio, 0));
    const iva = round2(num(e.iva) ?? 0);
    const reteFuente = round2(num(e.reteFuente) ?? 0);
    const reteIva = round2(num(e.reteIva) ?? 0);
    const kilosTotales = lineas.reduce((a, l) => a + l.kilos, 0);
    const pesoBruto = round2(num(e.pesoBruto) ?? kilosTotales * 1.07);
    const pesoMax = num(par?.Peso_Bruto_Maximo);
    if (pesoMax && pesoBruto > pesoMax) avisos.push(`El peso bruto (${pesoBruto} kg) supera el máximo parametrizado para este destino (${pesoMax} kg).`);
    if (!e.pesoBruto) avisos.push(`Peso bruto estimado: kilos netos + 7 % (${pesoBruto} kg). Cámbialo si tienes el real.`);
    const conHora = (f: string | null) => (f ? `${f} ${this.horaBogota()}` : '');

    const encabezado: Record<string, unknown> = {
      CodSecEntity: Number(e.cliente),
      CodSecComercialCondition: num(par?.CodSec_CommercialCondition),
      PurchaseOrder: txt(e.ordenCompra),
      Notes: txt(e.notas) || txt(e.ordenCompra),
      DeliveryDate: conHora(fechaEntrega),
      ShipmentDate: conHora(fechaDespacho),
      From: txt(par?.Desde),
      To: txt(par?.Hasta),
      Container: txt(e.contenedor) || 'CONTENEDOR ESTANDAR DE 40 PIES',
      SubTotal: subTotal,
      IVA: iva,
      ReteFuente: reteFuente,
      ReteIVA: reteIva,
      Total: round2(subTotal + iva - reteFuente - reteIva),
      CodSecIncoterm: num(par?.CodSec_Incoterms),
      Export: exporta ? 'true' : 'false',
      CodSecCity: num(par?.CodSec_City),
      NoteSalesOrderPF: txt(e.notaProforma) || txt(par?.Nota_Etiqueta) || 'N/A',
      NoteConsigned: txt(e.notaConsignado) || txt(par?.Consignado) || 'N/A',
      CodSecCurrency: num(par?.CodSec_Currency),
      // La API convierte el puerto a número: va el código de la ciudad del puerto (probado el 22-oct; el texto falla).
      DestinationPort: num(par?.CodSec_CityPort),
      GrossWeight: pesoBruto,
      CodSecEtiquetaPallet: num(par?.CodSec_EtiquetaPallet),
      CodSecEtiquetaBobina: num(par?.CodSec_EtiquetaBobina),
      Paperwork: num(e.documentos) ?? 0,
      CodSedCustomerAddress: Number(e.direccion),
      InvoiceMonth: conHora(this.fecha(e.mesFactura ?? e.fechaDespacho, 'mes de facturación', bloqueos)),
      Sample: e.muestra ? 'true' : 'false',
      CodSecCityDestinationPort: num(par?.CodSec_CityPort),
      OperationNotes: txt(e.notaOperativa) || txt(par?.Nota_Operativa) || 'N/A',
      CodSecShippingTypeSample: num(e.tipoEnvioMuestra) ?? 0,
      SpecialNotes: txt(e.notaEspecial) || txt(par?.Nota_Especial) || 'N/A',
      NoteNotified: txt(e.notaNotificado) || txt(par?.Notificado) || 'N/A',
      RequestDateCustomer: conHora(this.fecha(e.fechaSolicitudCliente ?? e.fechaEntrega, 'fecha solicitada por el cliente', bloqueos)),
      Stock: e.stock ? 'true' : 'false',
    };
    for (const [k, v] of Object.entries(encabezado)) {
      if (v === null || v === undefined || v === '') {
        if (par) bloqueos.push(`La parametrización de Oben no trae ${k} para este destino.`);
      }
    }
    if (fechaEntrega && fechaDespacho && fechaDespacho > fechaEntrega) avisos.push('La fecha de despacho es posterior a la de entrega.');

    return {
      servidor: await this.servidor(),
      simulado,
      cliente: txt(filaCliente?.Nombre_Cliente),
      destino,
      encabezado,
      lineas,
      empaque,
      avisos,
      bloqueos: [...new Set(bloqueos)],
    };
  }

  /** Crea el encabezado y las líneas en Oben (queda "creada", sin OV). Un reintento continúa donde quedó. */
  async crear(e: ProformaEntrada, usuario: string | null): Promise<ProformaOben> {
    const vista = await this.previsualizar(e);
    if (vista.bloqueos.length) throw new BadRequestException({ message: 'No se puede crear la proforma todavía.', bloqueos: vista.bloqueos });
    const tenantId = this.ctx.tenantId;
    let p = await this.repo.findOne({ where: { tenantId, servidor: vista.servidor, ordenCompra: txt(e.ordenCompra) } });
    if (p && p.estado !== 'pendiente') {
      throw new ConflictException(`Ya existe la proforma ${this.nombrePF(p)} para la orden de compra ${p.ordenCompra} (estado: ${p.estado}). Ábrela y continúa desde allí.`);
    }
    p ??= this.repo.create({ tenantId, servidor: vista.servidor, ordenCompra: txt(e.ordenCompra), estado: 'pendiente', pasos: [] });
    Object.assign(p, {
      cliente: vista.cliente,
      destino: vista.destino,
      entrada: e as unknown as Record<string, unknown>,
      encabezado: vista.encabezado,
      lineas: vista.lineas,
      error: null,
      creadoPor: this.ctx.userId ?? null,
      creadoPorNombre: usuario,
    });
    p = await this.repo.save(p);
    return this.continuar(p, usuario);
  }

  /** Continúa una proforma: encabezado (si falta) y las líneas que no se han creado. */
  async reintentar(id: string, usuario: string | null, verificado = false): Promise<ProformaOben> {
    const p = await this.obtener(id);
    if (p.estado === 'revisar' && !verificado) {
      throw new ConflictException('El último intento quedó sin respuesta de Oben: puede haberse hecho. Verifica en OBEN MAS y confirma que no quedó creado antes de reintentar.');
    }
    if (p.estado === 'revisar') p.estado = p.codigoInterno ? 'encabezado' : 'pendiente';
    return this.continuar(p, usuario);
  }

  /** Crea la orden de venta de la proforma (en el flujo: cuando el cliente la aprueba). */
  async crearOV(id: string, usuario: string | null): Promise<ProformaOben> {
    const p = await this.obtener(id);
    if (p.estado !== 'creada') throw new BadRequestException(this.porQueNo(p, 'crear la orden de venta'));
    const r = await this.escribir(p, 'ov', { CodSecSalesOrderHeadPF: p.codigoInterno }, usuario);
    if (r.ok) p.estado = 'ov_creada';
    return this.guardar(p, `Orden de venta de la proforma ${this.nombrePF(p)} creada en OBEN MAS`, usuario);
  }

  /** Activa la orden de venta (en el flujo: cuando cartera la libera). */
  async activar(id: string, usuario: string | null): Promise<ProformaOben> {
    const p = await this.obtener(id);
    if (p.estado !== 'ov_creada') throw new BadRequestException(this.porQueNo(p, 'activar la orden de venta'));
    const r = await this.escribir(p, 'activar', { CodSecSalesOrderHeadPF: p.codigoInterno }, usuario);
    if (r.ok) p.estado = 'activa';
    return this.guardar(p, `Orden de venta de la proforma ${this.nombrePF(p)} activada en OBEN MAS`, usuario);
  }

  private async continuar(p: ProformaOben, usuario: string | null): Promise<ProformaOben> {
    if (!p.codigoInterno) {
      const r = await this.escribir(p, 'encabezado', p.encabezado, usuario);
      if (!r.ok) return this.guardar(p, 'Encabezado de proforma rechazado por Oben', usuario);
      p.codigoInterno = r.codigoInterno ?? null;
      p.numeroPF = r.numeroPF ?? null;
      p.estado = 'encabezado';
      await this.repo.save(p);
    }
    const lineas = [...p.lineas];
    for (const [i, l] of lineas.entries()) {
      if (l.creada) continue;
      const r = await this.escribir(
        p,
        'detalle',
        {
          CodSecSalesOrderHeadPF: p.codigoInterno,
          CodSecProduct: l.codSecProduct,
          Quantity: l.kilos,
          Price: l.precio,
          ObservationLabel: l.etiqueta,
          PartNumber: l.numeroParte,
          CodSecTariff: l.codSecTariff,
          CodSecEntity: p.encabezado.CodSecEntity,
          CodSecEntityAddress: p.encabezado.CodSedCustomerAddress,
          CodSecCity: p.encabezado.CodSecCity,
        },
        usuario,
        i + 1,
      );
      if (!r.ok) {
        p.lineas = lineas;
        return this.guardar(p, `Línea ${i + 1} (${l.referencia}) rechazada por Oben`, usuario);
      }
      lineas[i] = { ...l, creada: true };
      p.lineas = lineas;
      await this.repo.save(p);
    }
    p.estado = 'creada';
    return this.guardar(p, `Proforma ${this.nombrePF(p)} creada en OBEN MAS (encabezado y ${lineas.length} línea${lineas.length === 1 ? '' : 's'})`, usuario);
  }

  /** Una escritura en Oben, registrada en `pasos`. Un timeout deja la proforma en "revisar" (nunca se repite sola). */
  private async escribir(p: ProformaOben, paso: EscrituraComercial, valores: Record<string, unknown>, usuario: string | null, linea?: number) {
    const r = await this.hub.call<{ ok?: boolean; codigoInterno?: number; numeroPF?: string | null }>('obenCostOrder', 'comercial.escribir', { paso, valores }, ESCRITURA);
    const registro: PasoProformaOben = { paso, ...(linea ? { linea } : {}), ok: r.ok, respuesta: '', en: new Date().toISOString(), por: usuario };
    if (r.ok) {
      registro.respuesta =
        paso === 'encabezado' ? `PF ${r.data?.numeroPF ?? '(Oben no devolvió el número oficial)'} · código interno ${r.data?.codigoInterno}` : 'OK';
      p.pasos = [...(p.pasos ?? []), registro];
      p.error = null;
      return { ok: true as const, codigoInterno: r.data?.codigoInterno, numeroPF: r.data?.numeroPF ?? null };
    }
    const error = String(r.error ?? 'sin respuesta');
    const sinRespuesta = /timeout|aborted|fetch failed|ECONN|socket|circuit_open/i.test(error) && !/BUSINESS_ERROR/.test(error);
    registro.respuesta = error.replace(/^.*BUSINESS_ERROR:\s*/, '');
    p.pasos = [...(p.pasos ?? []), registro];
    p.error = explicarRechazo(paso, registro.respuesta, sinRespuesta, linea);
    if (sinRespuesta) p.estado = 'revisar';
    return { ok: false as const };
  }

  private async guardar(p: ProformaOben, que: string, usuario: string | null): Promise<ProformaOben> {
    const guardada = await this.repo.save(p);
    await this.audit
      .log({
        workflowName: WORKFLOW,
        eventType: WorkflowEventType.ACTION_EXECUTED,
        action: 'proforma_oben',
        entityType: 'proforma_oben',
        entityId: p.id,
        actorId: this.ctx.userId,
        inputData: { que, usuario, ordenCompra: p.ordenCompra, servidor: p.servidor },
        outputData: { estado: p.estado, numeroPF: p.numeroPF, codigoInterno: p.codigoInterno, error: p.error },
      })
      .catch(() => undefined);
    this.logger.log(`${que}: estado ${p.estado}${p.error ? ` — ${p.error}` : ''}`);
    return guardada;
  }

  /** "PF 11600" (número oficial, el de seguimiento); si Oben no lo devolvió, el código interno. */
  private nombrePF(p: ProformaOben): string {
    return p.numeroPF ? `PF ${p.numeroPF}` : p.codigoInterno ? `(código interno ${p.codigoInterno})` : '';
  }

  private porQueNo(p: ProformaOben, accion: string): string {
    const estados: Record<string, string> = {
      pendiente: 'la proforma todavía no está creada en Oben',
      encabezado: 'faltan líneas del detalle: usa "Reintentar"',
      creada: 'la proforma está creada pero sin orden de venta',
      ov_creada: 'la orden de venta ya está creada',
      activa: 'la orden de venta ya está activa',
      revisar: 'el último paso quedó sin respuesta de Oben: verifica en OBEN MAS',
    };
    return `No se puede ${accion}: ${estados[p.estado] ?? p.estado}.`;
  }

  private async productosDe(lineas: LineaEntrada[]): Promise<Map<string, Fila>> {
    const mapa = new Map<string, Fila>();
    for (const l of lineas) {
      const q = l.codSecProduct ? String(l.codSecProduct) : txt(l.referencia);
      if (!q) continue;
      const items = (await this.maestros.maestro('productos', { buscar: q, limite: 200 })).items;
      const p = l.codSecProduct ? items.find((x) => Number(x.CodSec_Prod) === Number(l.codSecProduct)) : items.find((x) => txt(x.Referencia).toUpperCase() === q.toUpperCase());
      if (p) mapa.set(l.codSecProduct ? `#${l.codSecProduct}` : q.toUpperCase(), p);
    }
    return mapa;
  }

  private fecha(v: string | undefined, que: string, bloqueos: string[]): string | null {
    const m = txt(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) {
      bloqueos.push(`Falta la ${que} (AAAA-MM-DD).`);
      return null;
    }
    return `${m[1]}-${m[2]}-${m[3]}`;
  }

  /** Hora de Colombia, HH:MM:SS (Oben recibe las fechas con hora: "2026-12-06 16:29:45"). */
  private horaBogota(): string {
    return new Date(Date.now() - 5 * 3600e3).toISOString().slice(11, 19);
  }

  private async servidor(): Promise<'pruebas' | 'produccion'> {
    const t = await this.tenants.findOne({ where: { id: this.ctx.tenantId } });
    const cfg = (t?.integrationConfig?.obenCostOrder ?? {}) as Record<string, unknown>;
    const url = txt(cfg.comercialUrl) || COMERCIAL_URL_PRUEBAS;
    return url.includes('192.168.20.12') ? 'pruebas' : 'produccion';
  }
}

/** Lo que significa cada rechazo de Oben, en palabras claras (qué pasó y qué hacer). */
export function explicarRechazo(paso: EscrituraComercial, mensaje: string, sinRespuesta: boolean, linea?: number): string {
  const que = { encabezado: 'el encabezado de la proforma', detalle: `la línea ${linea ?? ''} del detalle`, ov: 'la orden de venta', activar: 'la activación de la orden de venta' }[paso];
  if (sinRespuesta) {
    return `Oben no respondió a tiempo al crear ${que}. Puede haberse creado: búscalo en OBEN MAS antes de reintentar, para no duplicarlo.`;
  }
  const lead = mensaje.match(/Lead Time Production para la pel[ií]cula\s+(\S+)/i);
  if (lead) {
    return `Oben no activó la orden de venta porque Planeación no tiene cargado el tiempo de producción (Lead Time) de la película ${lead[1].replace(/,$/, '')}. La orden de venta ya está creada: cuando Planeación lo cargue, vuelve a activarla.`;
  }
  if (/Maestro de Empaque/i.test(mensaje)) {
    return `Oben rechazó ${que}: la referencia no tiene Maestro de Empaque para ese cliente y destino. Planeación debe crearlo; luego se reintenta.`;
  }
  if (/No se pudo inserta/i.test(mensaje)) {
    return `Oben rechazó ${que} sin decir qué dato falla ("${mensaje}"). Revisa los datos y, si se repite, pásale el caso a José con los valores enviados.`;
  }
  if (/formato correcto|FormatException|booleano|DateTime/i.test(mensaje)) {
    return `Oben no pudo leer uno de los valores de ${que} (${mensaje}). Es un problema de formato en el envío: avisar a Paradixe.`;
  }
  return `Oben rechazó ${que}: ${mensaje}`;
}
