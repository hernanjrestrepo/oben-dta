import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import PDFDocument from 'pdfkit';
import { MockAdapterBase } from '../mock-adapter-base';
import { AdapterCapability } from '../adapter.types';
import { SCENARIO_PROVIDER, ScenarioProvider } from '../scenario.types';
import {
  InMemoryObenPlusSimStore,
  OBEN_PLUS_SIM_STORE,
  type ObenPlusSimStore,
  type SimProformaLinea,
  type SimProformaRecord,
} from '../oben-plus-sim.store';

/** Estados de una Proforma en OBEN MAS (reunión Comercial 2026-09-23: sin cubicar → cubicada → retenida → activa). */
export const PROFORMA_ESTADOS = ['sin_cubicar', 'cubicada', 'retenida', 'activa'] as const;
export type ProformaEstado = (typeof PROFORMA_ESTADOS)[number];

export interface ObenPlusProformaFechas {
  creacion: string;
  produccionInicio: string | null;
  produccionFin: string | null;
  entregaComprometida: string | null;
}

export interface ObenPlusProformaStatus {
  simulated: true;
  numberPF: string;
  cliente: string;
  estado: ProformaEstado;
  exportacion: boolean;
  pais: string;
  direccionEntrega: string;
  fechas: ObenPlusProformaFechas;
  /** Solo en Proformas creadas por el flujo Comercial dentro del simulador. */
  numberOrderSales?: number | null;
  anulada?: boolean;
}

export interface ObenPlusCartera {
  simulated: true;
  numberPF: string;
  /** Liberación de cartera (validación de cupo que NetSuite releva a OBEN MAS). */
  liberada: boolean;
  /** Producir No Despachar: la orden está activa en OBEN MAS pero cartera aún no libera. */
  pnd: boolean;
  fechaLiberacion: string | null;
  observacion: string;
}

/** Cartera de una ORDEN DE VENTA (lo que necesita la Lista de Empaque, que solo conoce la OV). */
export interface ObenPlusOvCartera {
  simulated: true;
  numberOrderSales: number;
  numberPF: string | null;
  liberada: boolean;
  pnd: boolean;
  fechaLiberacion: string | null;
  observacion: string;
}

export interface ObenPlusCubicaje {
  simulated: true;
  numberPF: string;
  tipoContenedor: string;
  contenedoresPlaneados: number;
  contenedoresCargados: number;
  pesoPlaneadoKg: number;
  pesoCargadoKg: number;
  volumenPlaneadoM3: number;
  volumenCargadoM3: number;
}

export interface ObenPlusProformaList {
  simulated: true;
  proformas: ObenPlusProformaStatus[];
}

/** El PDF oficial de la Proforma (el real vendrá de OBEN MAS tal cual, sin recrearlo). */
export interface ObenPlusProformaPdf {
  simulated: true;
  numberPF: string;
  filename: string;
  contentType: 'application/pdf';
  contentBase64: string;
}

/** Maestro de clientes de OBEN MAS (parametrización que hoy mantiene Alejandra). */
export interface ObenPlusCliente {
  simulated: true;
  codigoCliente: string;
  nombre: string;
  pais: string;
  exportacion: boolean;
  direcciones: Array<{ id: string; direccion: string; ciudad: string; pais: string }>;
  comercialEmail: string | null;
}

/** Catálogo fijo de Proformas SIMULADAS para listados/dashboard — prefijo SIM- para que nunca se confundan con una PF real. */
const CATALOGO_SIMULADO = Array.from({ length: 12 }, (_, i) => `SIM-${90001 + i}`);
const CLIENTES_SIMULADOS = [
  'CLIENTE SIMULADO EXPORTACIÓN A',
  'CLIENTE SIMULADO EXPORTACIÓN B',
  'CLIENTE SIMULADO NACIONAL C',
  'CLIENTE SIMULADO NACIONAL D',
];
const PAISES_EXPORTACION = ['USA', 'ECUADOR', 'PERU', 'MEXICO', 'BRASIL'];
const DAY_MS = 24 * 60 * 60 * 1000;
/** Primer número de las Proformas que crea el flujo Comercial dentro del simulador. */
const SIM_PF_BASE = 95000;
/** Las OV simuladas viven muy por encima de las reales (~10.000–12.000). */
const SIM_OV_BASE = 9_000_000;
/** Estándar de empaque SIMULADO: Planeación ajusta los kilos a múltiplos de esto al cubicar. */
const SIM_ESTANDAR_EMPAQUE_KG = 50;

/**
 * Oben+ / OBEN MAS (Comercial) — SIMULADO. Hoy no existe ninguna API de Oben
 * para Proformas, cartera, cubicaje ni maestro de clientes (ver
 * `Business/oben_comercial_blueprint_2026-09-27.html`, sección 1). Este mock
 * define el CONTRATO que esperamos de esos stored procedures y permite correr
 * el flujo Comercial completo de punta a punta; cuando Oben los exponga, se
 * agrega el adapter real y se cambia `integrationConfig.obenPlus.mode` — sin
 * tocar la lógica de negocio.
 *
 * Reglas del simulador:
 *  - TODO payload trae `simulated: true`; los consumidores lo propagan.
 *  - Proformas de catálogo (SIM-90001…) y cualquier número desconocido:
 *    deterministas por hash y coherentes entre operaciones.
 *  - Proformas creadas con `proforma.crear` (SIM-95001…): con estado
 *    persistido (ObenPlusSimStore) — se modifican, aprueban, anulan y activan
 *    como en OBEN MAS. Planeación (cubicaje), cartera y los cambios de fecha
 *    de producción los hacen personas en Oben: aquí se simulan con las
 *    operaciones `sim.*`, que solo existen en el simulador.
 *  - Cartera es independiente del estado: una orden `activa` puede seguir sin
 *    liberar (PND — Producir No Despachar, reunión 2026-09-23).
 */
@Injectable()
export class ObenPlusMockAdapter extends MockAdapterBase {
  readonly system = 'obenPlus';
  private readonly store: ObenPlusSimStore;

  constructor(
    @Inject(SCENARIO_PROVIDER) scenarios: ScenarioProvider,
    @Optional() @Inject(OBEN_PLUS_SIM_STORE) store?: ObenPlusSimStore,
  ) {
    super({}, scenarios);
    this.store = store ?? new InMemoryObenPlusSimStore();
  }

  capabilities(): AdapterCapability[] {
    return [
      { operation: 'proforma.status', method: 'read', description: 'Estado, fechas de producción y dirección de entrega de una Proforma (simulado)' },
      { operation: 'proforma.cartera', method: 'read', description: 'Liberación de cartera de una Proforma, incluido PND (simulado)' },
      { operation: 'proforma.cubicaje', method: 'read', description: 'Contenedores planeados vs cargados, peso y volumen (simulado)' },
      { operation: 'proforma.list', method: 'read', description: 'Proformas en seguimiento, filtrables por cliente/estado (simulado)' },
      { operation: 'proforma.pdf', method: 'read', description: 'PDF de la Proforma (simulado — NO es el documento oficial)' },
      { operation: 'ov.cartera', method: 'read', description: 'Liberación de cartera de una orden de venta, para la regla PND de Lista de Empaque (simulado)' },
      { operation: 'cliente.consultar', method: 'read', description: 'Maestro de un cliente: país, direcciones de entrega, comercial (simulado)' },
      { operation: 'proforma.crear', method: 'write', description: 'Crea la Proforma "sin cubicar" a partir de la orden de compra (simulado)' },
      { operation: 'proforma.modificar', method: 'write', description: 'Modifica cantidades; la Proforma vuelve a "sin cubicar" (simulado)' },
      { operation: 'proforma.aprobar', method: 'write', description: 'Aprobación del cliente: la Proforma pasa a orden de venta retenida (simulado)' },
      { operation: 'proforma.anular', method: 'write', description: 'Anula la Proforma (el cliente rechazó o se dio de baja) (simulado)' },
      { operation: 'ov.activar', method: 'write', description: 'Orden de venta retenida → activa, una vez cartera libera (simulado)' },
      { operation: 'sim.cubicar', method: 'write', description: 'SOLO SIMULADOR: Planeación cubica la Proforma' },
      { operation: 'sim.liberarCartera', method: 'write', description: 'SOLO SIMULADOR: cartera libera la orden' },
      { operation: 'sim.cambiarEntrega', method: 'write', description: 'SOLO SIMULADOR: Planeación cambia la fecha de entrega comprometida' },
      { operation: 'sim.producirNoDespachar', method: 'write', description: 'SOLO SIMULADOR: comodín PND — activa la orden sin que cartera haya liberado' },
    ];
  }

  protected operationHandlers() {
    return {
      'proforma.status': this.wrap((args, ctx) => this.statusOp(ctx.tenantId, requirePF(args)), 'proforma.status'),
      'proforma.cartera': this.wrap((args, ctx) => this.carteraOp(ctx.tenantId, requirePF(args)), 'proforma.cartera'),
      'proforma.cubicaje': this.wrap((args, ctx) => this.cubicajeOp(ctx.tenantId, requirePF(args)), 'proforma.cubicaje'),
      'proforma.list': this.wrap((args, ctx) => this.list(ctx.tenantId, args), 'proforma.list'),
      'proforma.pdf': this.wrap((args, ctx) => this.pdf(ctx.tenantId, requirePF(args)), 'proforma.pdf'),
      'ov.cartera': this.wrap((args, ctx) => this.ovCartera(ctx.tenantId, requireOV(args)), 'ov.cartera'),
      'cliente.consultar': this.wrap((args) => this.cliente(requireText(args, 'codigoCliente')), 'cliente.consultar'),
      'proforma.crear': this.wrap((args, ctx) => this.crear(ctx.tenantId, args), 'proforma.crear'),
      'proforma.modificar': this.wrap((args, ctx) => this.modificar(ctx.tenantId, args), 'proforma.modificar'),
      'proforma.aprobar': this.wrap((args, ctx) => this.aprobar(ctx.tenantId, requirePF(args)), 'proforma.aprobar'),
      'proforma.anular': this.wrap((args, ctx) => this.anular(ctx.tenantId, requirePF(args), args), 'proforma.anular'),
      'ov.activar': this.wrap((args, ctx) => this.activar(ctx.tenantId, requirePF(args)), 'ov.activar'),
      'sim.cubicar': this.wrap((args, ctx) => this.simCubicar(ctx.tenantId, requirePF(args)), 'sim.cubicar'),
      'sim.liberarCartera': this.wrap((args, ctx) => this.simLiberarCartera(ctx.tenantId, requirePF(args)), 'sim.liberarCartera'),
      'sim.cambiarEntrega': this.wrap((args, ctx) => this.simCambiarEntrega(ctx.tenantId, requirePF(args), args), 'sim.cambiarEntrega'),
      'sim.producirNoDespachar': this.wrap((args, ctx) => this.simPnd(ctx.tenantId, requirePF(args)), 'sim.producirNoDespachar'),
    };
  }

  // ─── Lecturas ────────────────────────────────────────────────────────────

  private async statusOp(tenantId: string, numberPF: string): Promise<ObenPlusProformaStatus> {
    const rec = await this.store.get(tenantId, numberPF);
    return rec ? recordStatus(rec) : this.status(numberPF);
  }

  private async carteraOp(tenantId: string, numberPF: string): Promise<ObenPlusCartera> {
    const rec = await this.store.get(tenantId, numberPF);
    if (!rec) return this.cartera(numberPF);
    return {
      simulated: true,
      numberPF,
      liberada: rec.carteraLiberada,
      pnd: rec.estado === 'activa' && !rec.carteraLiberada,
      fechaLiberacion: rec.fechaLiberacion,
      observacion: carteraObservacion(rec.estado, rec.carteraLiberada),
    };
  }

  private async cubicajeOp(tenantId: string, numberPF: string): Promise<ObenPlusCubicaje> {
    const rec = await this.store.get(tenantId, numberPF);
    if (!rec) return this.cubicaje(numberPF);
    const kilos = rec.lineas.reduce((acc, l) => acc + (l.kilosAjustados ?? l.kilos), 0);
    const planeados = rec.estado === 'sin_cubicar' ? 0 : Math.max(1, Math.ceil(kilos / 22_000));
    return {
      simulated: true,
      numberPF,
      tipoContenedor: rec.exportacion ? '40HC' : 'TRACTOMULA',
      contenedoresPlaneados: planeados,
      contenedoresCargados: 0,
      pesoPlaneadoKg: planeados > 0 ? kilos : 0,
      pesoCargadoKg: 0,
      volumenPlaneadoM3: planeados * 68,
      volumenCargadoM3: 0,
    };
  }

  private async ovCartera(tenantId: string, numberOrderSales: number): Promise<ObenPlusOvCartera> {
    const rec = await this.store.findByOv(tenantId, numberOrderSales);
    if (rec) {
      return {
        simulated: true,
        numberOrderSales,
        numberPF: rec.numberPF,
        liberada: rec.carteraLiberada,
        pnd: rec.estado === 'activa' && !rec.carteraLiberada,
        fechaLiberacion: rec.fechaLiberacion,
        observacion: carteraObservacion(rec.estado, rec.carteraLiberada),
      };
    }
    // OV desconocida para el simulador: 1 de cada 5 simula un PND (para poder
    // demostrar la retención de la Lista de Empaque).
    const h = seed(`ov|${numberOrderSales}`);
    const liberada = h[0] % 5 !== 0;
    return {
      simulated: true,
      numberOrderSales,
      numberPF: null,
      liberada,
      pnd: !liberada,
      fechaLiberacion: liberada ? daysFromToday(-(1 + (h[1] % 10))) : null,
      observacion: carteraObservacion('activa', liberada),
    };
  }

  private cliente(codigoCliente: string): ObenPlusCliente {
    const h = seed(`cliente|${codigoCliente}`);
    const exportacion = h[0] % 2 === 0;
    const pais = exportacion ? PAISES_EXPORTACION[h[1] % PAISES_EXPORTACION.length] : 'COLOMBIA';
    const n = exportacion ? 1 + (h[2] % 3) : 1;
    return {
      simulated: true,
      codigoCliente,
      nombre: `CLIENTE SIMULADO ${codigoCliente}`,
      pais,
      exportacion,
      direcciones: Array.from({ length: n }, (_, i) => ({
        id: `${codigoCliente}-DIR${i + 1}`,
        direccion: `DIRECCIÓN SIMULADA ${i + 1} (Oben+ mock) — Bodega ${1 + ((h[3] + i) % 9)}`,
        ciudad: `CIUDAD SIMULADA ${i + 1}`,
        pais,
      })),
      comercialEmail: null,
    };
  }

  private async list(tenantId: string, args: Record<string, unknown>): Promise<ObenPlusProformaList> {
    const cliente = typeof args.cliente === 'string' ? args.cliente.trim().toLowerCase() : '';
    const estado = typeof args.estado === 'string' ? args.estado : '';
    if (estado && !(PROFORMA_ESTADOS as readonly string[]).includes(estado)) {
      throw new Error(`BUSINESS_ERROR: estado inválido (${PROFORMA_ESTADOS.join(', ')})`);
    }
    const creadas = await this.store.list(tenantId);
    const todas = [...CATALOGO_SIMULADO.map((pf) => this.status(pf)), ...creadas.filter((r) => !r.anulada).map(recordStatus)];
    const proformas = todas.filter(
      (p) => (!cliente || p.cliente.toLowerCase() === cliente) && (!estado || p.estado === estado),
    );
    return { simulated: true, proformas };
  }

  /**
   * José fue explícito: el PDF real de la Proforma NO se recrea — ni una letra
   * ni un espacio puede cambiar frente al diseño aprobado por el corporativo;
   * se recibe vía API tal cual. Este es solo un marcador SIMULADO, rotulado en
   * cada página, para poder probar el flujo.
   */
  private async pdf(tenantId: string, numberPF: string): Promise<ObenPlusProformaPdf> {
    const status = await this.statusOp(tenantId, numberPF);
    const doc = new PDFDocument({ size: 'letter', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#B00020').text('PROFORMA SIMULADA', { align: 'center' });
    doc
      .font('Helvetica')
      .fontSize(10)
      .text('NO es el documento oficial de Oben — el PDF real vendrá de OBEN MAS vía API, idéntico al aprobado.', { align: 'center' });
    doc.moveDown();
    doc.fillColor('#111111').fontSize(11);
    for (const [label, value] of [
      ['Proforma', numberPF],
      ['Cliente (simulado)', status.cliente],
      ['País (simulado)', status.pais],
      ['Estado (simulado)', status.estado],
      ['Fecha de creación (simulada)', status.fechas.creacion],
    ]) {
      doc.font('Helvetica-Bold').text(`${label}: `, { continued: true }).font('Helvetica').text(value);
    }
    doc.end();
    return {
      simulated: true,
      numberPF,
      filename: `Proforma_SIMULADA-PF${numberPF}.pdf`,
      contentType: 'application/pdf',
      contentBase64: (await done).toString('base64'),
    };
  }

  // ─── Escrituras (contrato de los SP transaccionales que pediremos a Oben) ─

  private async crear(tenantId: string, args: Record<string, unknown>) {
    const codigoCliente = requireText(args, 'codigoCliente');
    const cliente = requireText(args, 'cliente');
    const direccionEntrega = requireText(args, 'direccionEntrega');
    const pais = requireText(args, 'pais').toUpperCase();
    const lineas = parseLineas(args.lineas);
    const n = SIM_PF_BASE + 1 + (await this.store.count(tenantId));
    const rec: SimProformaRecord = {
      numberPF: `SIM-${n}`,
      codigoCliente,
      cliente,
      exportacion: pais !== 'COLOMBIA',
      pais,
      direccionEntrega,
      ordenCompra: optText(args.ordenCompra),
      clienteFinal: optText(args.clienteFinal),
      fechaRequerida: optText(args.fechaRequerida),
      estado: 'sin_cubicar',
      anulada: false,
      motivoAnulacion: null,
      lineas,
      numberOrderSales: null,
      carteraLiberada: false,
      fechaLiberacion: null,
      fechas: { creacion: daysFromToday(0), produccionInicio: null, produccionFin: null, entregaComprometida: null },
      historial: [{ fecha: new Date().toISOString(), evento: 'Proforma creada (sin cubicar)' }],
    };
    await this.store.save(tenantId, rec);
    return { simulated: true, numberPF: rec.numberPF, estado: rec.estado };
  }

  private async modificar(tenantId: string, args: Record<string, unknown>) {
    const rec = await this.mustGet(tenantId, requirePF(args));
    if (rec.estado !== 'sin_cubicar' && rec.estado !== 'cubicada') {
      throw new Error(`BUSINESS_ERROR: la Proforma ${rec.numberPF} está "${rec.estado}" — ya no se puede modificar`);
    }
    rec.lineas = parseLineas(args.lineas);
    // José (reunión 2026-09-23, 36:51): al modificar, vuelve a "sin cubicar" —
    // Planeación tiene que cubicar de nuevo porque cambian pallets y bobinas.
    rec.estado = 'sin_cubicar';
    rec.historial.push({ fecha: new Date().toISOString(), evento: 'Modificada: vuelve a sin cubicar' });
    await this.store.save(tenantId, rec);
    return { simulated: true, numberPF: rec.numberPF, estado: rec.estado };
  }

  private async aprobar(tenantId: string, numberPF: string) {
    const rec = await this.mustGet(tenantId, numberPF);
    if (rec.estado !== 'cubicada') {
      throw new Error(`BUSINESS_ERROR: solo se aprueba una Proforma cubicada (está "${rec.estado}")`);
    }
    rec.estado = 'retenida';
    rec.numberOrderSales = SIM_OV_BASE + (Number(numberPF.replace(/\D/g, '')) - SIM_PF_BASE);
    rec.historial.push({ fecha: new Date().toISOString(), evento: `Aprobada por el cliente: OV ${rec.numberOrderSales} retenida` });
    await this.store.save(tenantId, rec);
    return { simulated: true, numberPF, estado: rec.estado, numberOrderSales: rec.numberOrderSales };
  }

  private async anular(tenantId: string, numberPF: string, args: Record<string, unknown>) {
    const rec = await this.mustGet(tenantId, numberPF);
    if (rec.estado === 'activa') throw new Error('BUSINESS_ERROR: una orden de venta activa no se anula desde aquí');
    rec.anulada = true;
    rec.motivoAnulacion = optText(args.motivo);
    rec.historial.push({ fecha: new Date().toISOString(), evento: `Anulada${rec.motivoAnulacion ? `: ${rec.motivoAnulacion}` : ''}` });
    await this.store.save(tenantId, rec);
    return { simulated: true, numberPF, anulada: true };
  }

  private async activar(tenantId: string, numberPF: string) {
    const rec = await this.mustGet(tenantId, numberPF);
    if (rec.estado !== 'retenida') throw new Error(`BUSINESS_ERROR: solo se activa una orden retenida (está "${rec.estado}")`);
    if (!rec.carteraLiberada) throw new Error('BUSINESS_ERROR: cartera no ha liberado la orden');
    await this.saveActiva(tenantId, rec, 'Orden de venta activa');
    return { simulated: true, numberPF, estado: rec.estado, numberOrderSales: rec.numberOrderSales };
  }

  /** Comodín "Producir No Despachar" (Alejandra, 14:50): se produce aunque cartera no haya liberado. */
  private async simPnd(tenantId: string, numberPF: string) {
    const rec = await this.mustGet(tenantId, numberPF);
    if (rec.estado !== 'retenida') throw new Error(`BUSINESS_ERROR: PND aplica a una orden retenida (está "${rec.estado}")`);
    await this.saveActiva(tenantId, rec, 'PND: activa sin liberación de cartera (simulado)');
    return { simulated: true, numberPF, estado: rec.estado, numberOrderSales: rec.numberOrderSales, pnd: !rec.carteraLiberada };
  }

  private async saveActiva(tenantId: string, rec: SimProformaRecord, evento: string) {
    rec.estado = 'activa';
    const inicio = daysFromToday(2);
    const fin = addDays(inicio, 5);
    rec.fechas = { ...rec.fechas, produccionInicio: inicio, produccionFin: fin, entregaComprometida: addDays(fin, rec.exportacion ? 20 : 3) };
    rec.historial.push({ fecha: new Date().toISOString(), evento });
    await this.store.save(tenantId, rec);
  }

  private async simCubicar(tenantId: string, numberPF: string) {
    const rec = await this.mustGet(tenantId, numberPF);
    if (rec.estado !== 'sin_cubicar') throw new Error(`BUSINESS_ERROR: la Proforma está "${rec.estado}", no "sin_cubicar"`);
    rec.estado = 'cubicada';
    rec.lineas = rec.lineas.map((l) => ({
      ...l,
      kilosAjustados: Math.max(SIM_ESTANDAR_EMPAQUE_KG, Math.round(l.kilos / SIM_ESTANDAR_EMPAQUE_KG) * SIM_ESTANDAR_EMPAQUE_KG),
    }));
    rec.historial.push({ fecha: new Date().toISOString(), evento: 'Cubicada por Planeación (simulado)' });
    await this.store.save(tenantId, rec);
    return { simulated: true, numberPF, estado: rec.estado };
  }

  private async simLiberarCartera(tenantId: string, numberPF: string) {
    const rec = await this.mustGet(tenantId, numberPF);
    if (rec.estado !== 'retenida' && rec.estado !== 'activa') {
      throw new Error(`BUSINESS_ERROR: cartera solo aplica a una orden de venta (la Proforma está "${rec.estado}")`);
    }
    rec.carteraLiberada = true;
    rec.fechaLiberacion = daysFromToday(0);
    rec.historial.push({ fecha: new Date().toISOString(), evento: 'Cartera liberó la orden (simulado)' });
    await this.store.save(tenantId, rec);
    return { simulated: true, numberPF, liberada: true };
  }

  private async simCambiarEntrega(tenantId: string, numberPF: string, args: Record<string, unknown>) {
    const rec = await this.mustGet(tenantId, numberPF);
    const fecha = requireText(args, 'fecha');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('BUSINESS_ERROR: fecha debe ser YYYY-MM-DD');
    const anterior = rec.fechas.entregaComprometida;
    rec.fechas = { ...rec.fechas, entregaComprometida: fecha };
    rec.historial.push({ fecha: new Date().toISOString(), evento: `Entrega comprometida ${anterior ?? '—'} → ${fecha} (simulado)` });
    await this.store.save(tenantId, rec);
    return { simulated: true, numberPF, anterior, entregaComprometida: fecha };
  }

  private async mustGet(tenantId: string, numberPF: string): Promise<SimProformaRecord> {
    const rec = await this.store.get(tenantId, numberPF);
    if (!rec) {
      throw new Error(`BUSINESS_ERROR: la Proforma ${numberPF} no existe en el simulador (solo se escriben las creadas con proforma.crear)`);
    }
    if (rec.anulada) throw new Error(`BUSINESS_ERROR: la Proforma ${numberPF} está anulada`);
    return rec;
  }

  // ─── Catálogo determinista (Proformas no creadas en el simulador) ────────

  private status(numberPF: string): ObenPlusProformaStatus {
    const h = seed(numberPF);
    const estado = PROFORMA_ESTADOS[h[0] % PROFORMA_ESTADOS.length];
    const exportacion = h[1] % 2 === 0;
    const pais = exportacion ? PAISES_EXPORTACION[h[2] % PAISES_EXPORTACION.length] : 'COLOMBIA';
    const creacion = daysFromToday(-(5 + (h[3] % 30)));
    // Antes de 'retenida' la producción no está programada todavía.
    const programada = estado === 'retenida' || estado === 'activa';
    const produccionInicio = programada ? addDays(creacion, 3 + (h[4] % 5)) : null;
    const produccionFin = produccionInicio ? addDays(produccionInicio, 4 + (h[5] % 6)) : null;
    return {
      simulated: true,
      numberPF,
      cliente: CLIENTES_SIMULADOS[h[6] % CLIENTES_SIMULADOS.length],
      estado,
      exportacion,
      pais,
      // Sin país en el texto: el país real del pedido lo da Oben (spEmpaqueUnificada)
      // y otro simulador podría contradecirlo en una demo.
      direccionEntrega: `DIRECCIÓN SIMULADA (Oben+ mock) — Bodega ${1 + (h[7] % 9)}`,
      fechas: {
        creacion,
        produccionInicio,
        produccionFin,
        entregaComprometida: produccionFin ? addDays(produccionFin, exportacion ? 20 : 3) : null,
      },
    };
  }

  private cartera(numberPF: string): ObenPlusCartera {
    const { estado, fechas } = this.status(numberPF);
    // Activa casi siempre con cartera liberada; 1 de cada 4 simula un PND.
    const liberada = estado === 'activa' && seed(numberPF)[11] % 4 !== 0;
    return {
      simulated: true,
      numberPF,
      liberada,
      pnd: estado === 'activa' && !liberada,
      fechaLiberacion: liberada ? addDays(fechas.creacion, 2) : null,
      observacion: carteraObservacion(estado, liberada),
    };
  }

  private cubicaje(numberPF: string): ObenPlusCubicaje {
    const { estado, exportacion } = this.status(numberPF);
    const h = seed(numberPF);
    const tipoContenedor = exportacion ? (h[8] % 2 === 0 ? '40HC' : '20GP') : 'TRACTOMULA';
    if (estado === 'sin_cubicar') {
      return {
        simulated: true,
        numberPF,
        tipoContenedor,
        contenedoresPlaneados: 0,
        contenedoresCargados: 0,
        pesoPlaneadoKg: 0,
        pesoCargadoKg: 0,
        volumenPlaneadoM3: 0,
        volumenCargadoM3: 0,
      };
    }
    const planeados = 1 + (h[9] % 3);
    const cargados = estado === 'activa' ? h[10] % (planeados + 1) : 0;
    const kgPorContenedor = tipoContenedor === '20GP' ? 18_000 : 22_000;
    const m3PorContenedor = tipoContenedor === '20GP' ? 28 : 68;
    return {
      simulated: true,
      numberPF,
      tipoContenedor,
      contenedoresPlaneados: planeados,
      contenedoresCargados: cargados,
      pesoPlaneadoKg: planeados * kgPorContenedor,
      pesoCargadoKg: cargados * kgPorContenedor,
      volumenPlaneadoM3: planeados * m3PorContenedor,
      volumenCargadoM3: cargados * m3PorContenedor,
    };
  }
}

function recordStatus(rec: SimProformaRecord): ObenPlusProformaStatus {
  return {
    simulated: true,
    numberPF: rec.numberPF,
    cliente: rec.cliente,
    estado: rec.estado,
    exportacion: rec.exportacion,
    pais: rec.pais,
    direccionEntrega: rec.direccionEntrega,
    fechas: rec.fechas,
    numberOrderSales: rec.numberOrderSales,
    anulada: rec.anulada,
  };
}

function carteraObservacion(estado: ProformaEstado, liberada: boolean): string {
  if (liberada) return 'Cartera liberada.';
  if (estado === 'activa') {
    return 'PND — Producir No Despachar: la orden sigue en producción pero cartera aún no libera (validación de cupo en NetSuite).';
  }
  if (estado === 'retenida') return 'Retenida: pendiente de validación de cupo/crédito (NetSuite, relevado por OBEN MAS).';
  return 'Aún no aplica: la Proforma no ha sido aprobada por el cliente.';
}

function parseLineas(raw: unknown): SimProformaLinea[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('BUSINESS_ERROR: lineas requeridas');
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  return raw.map((l, i) => {
    const o = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>;
    const codigoOben = optText(o.codigoOben);
    const kilos = n(o.kilos);
    if (!codigoOben || kilos === null) {
      throw new Error(`BUSINESS_ERROR: la línea ${i + 1} necesita codigoOben y kilos > 0`);
    }
    return {
      codigoOben,
      descripcion: optText(o.descripcion),
      kilos,
      kilosAjustados: null,
      anchoMm: n(o.anchoMm),
      espesorMicras: n(o.espesorMicras),
      precioUnitario: n(o.precioUnitario),
    };
  });
}

function optText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : null;
}

function requireText(args: Record<string, unknown>, key: string): string {
  const v = optText(args[key]);
  if (!v) throw new Error(`BUSINESS_ERROR: ${key} requerido`);
  return v;
}

function requirePF(args: Record<string, unknown>): string {
  const raw = args.numberPF;
  const numberPF = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  if (!numberPF) throw new Error('BUSINESS_ERROR: numberPF requerido');
  return numberPF;
}

function requireOV(args: Record<string, unknown>): number {
  const n = Number(args.numberOrderSales);
  if (!Number.isInteger(n) || n <= 0) throw new Error('BUSINESS_ERROR: numberOrderSales requerido');
  return n;
}

/** Bytes deterministas por Proforma — la misma PF siempre simula lo mismo. */
function seed(numberPF: string): Buffer {
  return createHash('sha256').update(`obenPlus|${numberPF}`).digest();
}

function daysFromToday(days: number): string {
  const today = new Date(new Date().toISOString().slice(0, 10));
  return new Date(today.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  return new Date(new Date(isoDate).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}
