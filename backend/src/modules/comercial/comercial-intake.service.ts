import { remitenteReenviado } from '../../common/correo-texto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { OBEN_QUERY_OPTIONS } from '../oben-reports/oben-reports.service';
import { ClientsService } from '../clients/clients.service';
import { EquivalencesService } from '../equivalences/equivalences.service';
import type { Client } from '../../entities/client.entity';
import type { CasoDestino, CasoLinea, ComercialCase } from '../../entities/comercial-case.entity';
import { IaModelosService } from '../ia/ia-modelos.service';
import { construirLinea, extraerConIa, extraerConReglas, normTexto, sinLineasRepetidas, textoDeAdjuntos, type EquivalenciaRef, type OcAdjunto, type OcExtraccion } from './oc-extractor';
import type { ComercialConfig } from './comercial-config';
import { ComercialMaestrosService } from './comercial-maestros.service';
import { OBEN_US_CODIGO, esPedidoObenUs, fechaCdd, precioParaLinea, preciosTransferencia } from './triangulado';

export interface OcEntrada {
  from: string;
  subject: string;
  body: string;
  messageId?: string | null;
  receivedAt?: Date;
  attachments?: OcAdjunto[];
}

/** Maestro del cliente en OBEN MAS (`obenPlus` → `cliente.consultar`). */
export interface MaestroCliente {
  pais: string;
  exportacion: boolean;
  direcciones: Array<{ id: string; direccion: string; ciudad: string | null; pais: string }>;
  comercialEmail: string | null;
  simulated: boolean;
}

/** Dominios reservados para pruebas (RFC 2606): nunca pertenecen a un cliente real. */
export const DOMINIO_DEMO_RE = /\.(example|test|invalid)$/i;

/**
 * Dominios PROPIOS de Paradixe: sirven para probar el ciclo con correos reales sin tocar a ningún cliente de Oben.
 * El candado de "nunca enviar datos simulados a un cliente real" los trata como destinos de prueba.
 */
export const DOMINIOS_INTERNOS_PRUEBA = ['paradixe.xyz'];

/** ¿Este correo es de un destino de prueba (dominio reservado o dominio interno de Paradixe)? */
export function esDestinoDePrueba(email: string): boolean {
  const dominio = (email.split('@')[1] ?? '').trim().toLowerCase();
  return DOMINIO_DEMO_RE.test(dominio) || DOMINIOS_INTERNOS_PRUEBA.includes(dominio);
}

export const MAESTRO_SIMULADO_LABEL = 'Maestro del cliente (país y direcciones) desde el SIMULADOR de OBEN MAS';
export const CLIENTE_DEMO_LABEL = 'Cliente de demostración (dominio de prueba): datos simulados';

/**
 * Orden de compra → caso comercial (reunión 2026-09-23). Identifica al
 * cliente por el dominio EXACTO del remitente, lee la orden (reglas o IA),
 * traduce cada línea con la tabla de equivalencias del cliente, convierte
 * unidades, resuelve el destino contra el maestro del cliente en OBEN MAS y
 * lista TODO lo que falta — nunca rellena un dato.
 */
/** Dominios de Oben: un correo de aquí no es de un cliente (reenvíos internos, 3-nov). */
export const DOMINIOS_INTERNOS_OBEN = ['obengroup.com'];
const esDominioInterno = (correo: string): boolean => DOMINIOS_INTERNOS_OBEN.some((d) => (correo.split('@')[1] ?? '').trim() === d || (correo.split('@')[1] ?? '').trim().endsWith(`.${d}`));

@Injectable()
export class ComercialIntakeService {
  private readonly logger = new Logger(ComercialIntakeService.name);

  constructor(
    private readonly hub: IntegrationHubService,
    private readonly clients: ClientsService,
    private readonly equivalences: EquivalencesService,
    @Optional() private readonly maestros?: ComercialMaestrosService,
    /** IA de OpenRouter: lee imágenes y PDF escaneados y rescata órdenes que las reglas no entienden (3-nov). */
    @Optional() private readonly ia?: IaModelosService,
  ) {}

  /** Arma los datos del caso (sin guardarlo). */
  async construir(input: OcEntrada, config: ComercialConfig): Promise<Partial<ComercialCase>> {
    const enviadoPor = input.from.trim().toLowerCase();
    const atencion: string[] = [];
    // Reenvío de alguien de Oben ("RV:" de Comercial/Customer Service, 3-nov): el cliente es el remitente ORIGINAL del
    // correo reenviado, no quien lo reenvía. Si no se encuentra, se dice así y no se acusa de suplantación.
    const internoOben = esDominioInterno(enviadoPor);
    const original = internoOben ? remitenteReenviado(input.body, DOMINIOS_INTERNOS_OBEN) : null;
    const from = original ?? enviadoPor;
    const dominio = (from.split('@')[1] ?? '').trim();
    let { client, ambiguous } = internoOben && !original ? { client: null, ambiguous: false } : await this.clients.findByEmailDomain(dominio);
    // Reenvío de Oben sin remitente original ("NUEVO PEDIDO VICTOR CASTAÑEDA"): el cliente puede venir nombrado en el asunto.
    if (!client && internoOben && !original) {
      client = await this.clients.findByNameInText(input.subject);
      if (client) atencion.push(`Cliente tomado del asunto del correo: ${client.name}.`);
    }
    // Se lee la orden (cuerpo + adjuntos) ANTES de decidir de quién es: un dominio no registrado (Gmail, un dominio nuevo) ya no
    // frena la orden (Hernán, 4-nov: "que tome de cualquier dominio y lo genere"); el cliente se identifica por lo que dice la orden.
    const adj = await textoDeAdjuntos(
      input.attachments ?? [],
      this.ia ? async (a) => (await this.ia!.leerDocumento(a))?.texto ?? null : undefined,
    );
    const unico = sinLineasRepetidas(input.body, adj.texto);
    if (unico.quitadas > 0) adj.notas.push(`El correo y el adjunto traen las mismas líneas: se contaron una sola vez (${unico.quitadas} repetida(s) del adjunto).`);
    let texto = [input.body, unico.texto].filter(Boolean).join('\n');
    // Triangulado con OBEN US (Alejandra, 6-nov): la orden del cliente final va dirigida a OBEN US, que es NUESTRO cliente;
    // no cuenta el dominio de quien la manda ni el nombre del cliente final.
    const triangulado = esPedidoObenUs(`${input.subject}\n${texto}`);
    if (triangulado) {
      const obenUs = await this.clients.findByObenCode(OBEN_US_CODIGO, /\boben\s+us\b/i);
      if (obenUs) {
        if (client && client.id !== obenUs.id) atencion.push(`La orden va dirigida a OBEN US: el cliente es OBEN US, no ${client.name} (dueño del dominio "${dominio}").`);
        client = obenUs;
        ambiguous = false;
        atencion.push('Pedido triangulado con OBEN US: el cliente es OBEN US, el destino es la dirección de entrega de la orden y el precio es el Transfer Price del correo.');
      } else {
        // Nunca el dueño del dominio ni el cliente final: sin OBEN US creado, la orden queda sin cliente.
        client = null;
        ambiguous = false;
        atencion.push(`La orden va dirigida a OBEN US, pero OBEN US, LLC (código ${OBEN_US_CODIGO} de OBEN MAS) no está creado en Clientes: créalo para que estas órdenes se asignen solas.`);
      }
    }
    if (!client && !ambiguous && !triangulado) {
      client = await this.clients.identificarPorContenido(`${input.subject}\n${texto}`, DOMINIOS_INTERNOS_OBEN);
    }
    if (internoOben && original) {
      if (!client) {
        atencion.push(`El cliente del correo original (dominio "${dominio}") no está registrado en Clientes: créalo con ese dominio autorizado y vuelve a procesar la orden, o asigna el cliente a mano.`);
      }
    } else if (internoOben) {
      atencion.push(`Reenviada por ${enviadoPor} (Oben): no se encontró el remitente original del cliente en el correo — elige el cliente a mano.`);
    } else if (!client) {
      atencion.push(
        ambiguous
          ? `El dominio "${dominio}" está autorizado para más de un cliente: no se puede saber de quién es la orden — asígnala a mano.`
          : `El dominio "${dominio}" no está registrado y no se pudo identificar el cliente por el nombre ni por los correos de la orden — elige el cliente a mano.`,
      );
    }

    const equivalencias: EquivalenciaRef[] = client
      ? (await this.equivalences.findAll(client.id)).map((e) => ({ id: e.id, clientCode: e.clientCode, obenCode: e.obenCode }))
      : [];

    let extraccion = await this.extraer(texto, input.subject, equivalencias, config, client);
    // El PDF tiene texto pero con las columnas desordenadas (precio, cantidad y producto sueltos: la OC 93252 de INTALPEL, 4-nov):
    // sin líneas, se relee el PDF con visión/OCR, que respeta la tabla, y se vuelve a extraer.
    const completas = (e: OcExtraccion) => e.lineas.filter((l) => l.kilos != null && l.anchoMm != null).length;
    // La IA sobre el texto desordenado de un PDF lee mal (kilos = total, ancho inventado): ahí siempre se relee con visión.
    const primeraPorIa = extraccion.extraidoPor === 'ia' && !texto.includes('(leído con IA)') && (input.attachments ?? []).some((x) => /pdf/i.test(`${x.filename} ${x.contentType}`));
    if ((extraccion.lineas.length === 0 || extraccion.lineas.some((l) => l.anchoMm == null) || primeraPorIa) && this.ia) {
      const visuales: string[] = [];
      const pdfs = (input.attachments ?? []).filter((x) => x.content && x.content.length > 0 && (/\.pdf$/i.test(x.filename || '') || /pdf/i.test(x.contentType ?? '')));
      for (const a of pdfs.slice(0, 2)) {
        try {
          const v = (await this.ia.leerDocumento({ filename: a.filename || 'adjunto.pdf', contentType: a.contentType ?? null, content: a.content! }))?.texto;
          if (v && v.trim()) visuales.push(`--- ${a.filename} (leído con IA) ---\n${v}`);
        } catch (err) {
          this.logger.warn(`Relectura visual de "${a.filename}" falló: ${(err as Error).message}`);
        }
      }
      if (visuales.length > 0) {
        const texto2 = [input.body, ...visuales].filter(Boolean).join('\n');
        const r2 = await this.extraer(texto2, input.subject, equivalencias, config, client);
        if (r2.lineas.length > 0 && (primeraPorIa || completas(r2) > completas(extraccion))) {
          // La fecha la dicen las reglas ("DESPACHO: 2026/11/18") antes que la IA, que a veces toma otra.
          const fechaReglas = extraerConReglas(texto2, input.subject, []).fechaRequerida;
          extraccion = { ...r2, numero: r2.numero ?? extraccion.numero, fechaRequerida: fechaReglas ?? r2.fechaRequerida ?? extraccion.fechaRequerida };
          texto = texto2;
        }
      }
    }
    if (triangulado) {
      // El precio de la orden es el de OBEN US con su cliente; el nuestro es el Transfer Price del cuerpo del correo (en US$/kg).
      const precios = preciosTransferencia(texto);
      if (precios.length === 0) {
        atencion.push('Pedido triangulado con OBEN US: el correo no trae el cuadro con el Transfer Price — escribe el precio por kilo de cada línea (el de la orden es el de OBEN US con su cliente).');
      }
      extraccion = {
        ...extraccion,
        lineas: extraccion.lineas.map((l) => {
          const p = precioParaLinea(precios, `${l.codigoCliente ?? ''} ${l.textoCliente}`);
          const conversiones = l.conversiones.filter((c) => !/^precio /.test(c));
          return p ? { ...l, precioUnitario: p.porKg, moneda: 'USD', conversiones: [...conversiones, p.nota] } : { ...l, precioUnitario: null, conversiones };
        }),
      };
    }
    // CDD del cuerpo del correo (pedidos de Estados Unidos) = fecha requerida por el cliente: manda sobre la que lea la orden.
    const cdd = fechaCdd(`${input.subject}\n${texto}`);
    if (cdd) extraccion = { ...extraccion, fechaRequerida: cdd };
    const maestro = client?.obenCode ? await this.maestro(client.obenCode) : null;
    // Sin dirección legible en la orden, se busca entre los destinos del cliente la que aparece en la orden adjunta y, si ahí no
    // está, en el cuerpo del correo (Hernán, 6-nov). Un empate (p. ej. la dirección de la firma) no se adivina.
    const textoAdjuntos = texto.split(/^--- .+ ---\s*$/m).slice(1).join('\n');
    let destino = maestro && 'error' in maestro ? null : this.resolverDestino(maestro, extraccion.direccionEntrega, textoAdjuntos);
    if (destino && 'error' in destino && maestro && !('error' in maestro)) {
      const porCorreo = this.resolverDestino(maestro, null, `${input.subject}\n${texto}`);
      if (porCorreo && 'direccion' in porCorreo) destino = porCorreo;
    }

    const simulatedItems = [
      ...(maestro && !('error' in maestro) && maestro.simulated ? [MAESTRO_SIMULADO_LABEL] : []),
      ...(DOMINIO_DEMO_RE.test(dominio) ? [CLIENTE_DEMO_LABEL] : []),
    ];

    const caso: Partial<ComercialCase> = {
      clientId: client?.id ?? null,
      cliente: client?.name ?? null,
      codigoClienteOben: client?.obenCode ?? null,
      clienteFinal: extraccion.clienteFinal,
      contactoEmail: from,
      comercialEmail: client?.comercialEmail ?? (maestro && !('error' in maestro) ? maestro.comercialEmail : null),
      ocNumero: extraccion.numero,
      ocMessageId: input.messageId ?? null,
      ocAsunto: input.subject.slice(0, 500),
      ocRecibidaEn: input.receivedAt ?? new Date(),
      ocTexto: texto.slice(0, 50_000),
      ocAdjuntos: adj.resumen,
      extraidoPor: extraccion.extraidoPor,
      tipo: maestro && !('error' in maestro) ? (maestro.exportacion ? 'exportacion' : 'nacional') : null,
      pais: maestro && !('error' in maestro) ? maestro.pais : null,
      destino: destino && 'direccion' in destino ? destino : null,
      fechaRequerida: extraccion.fechaRequerida,
      lineas: extraccion.lineas,
      atencion: [...atencion, ...adj.notas, ...extraccion.notas],
      simulated: simulatedItems.length > 0,
      simulatedItems,
    };
    caso.missing = calcularMissing(caso, {
      client,
      maestroError: maestro && 'error' in maestro ? maestro.error : null,
      destinoError: destino && 'error' in destino ? destino.error : null,
    });
    return caso;
  }

  /**
   * Las líneas ya guardadas de un caso, traducidas otra vez con las reglas vigentes (equivalencias del cliente, película por
   * texto, gauge, libras/pulgadas y precio por kilo). Para "Volver a leer la orden" (6-nov): releer solo el texto guardado,
   * sin los PDF adjuntos, leía peor que la primera vez (650.000 kg en vez de 650, 51 mm en vez de 1.258); las cantidades,
   * anchos y precios que ya estaban bien leídos se conservan. `releida` aporta lo que la relectura sí lee bien: el código
   * del ítem de cada línea y el Transfer Price de los pedidos triangulados con OBEN US.
   */
  async reconstruirLineas(guardadas: CasoLinea[], clientId: string | null, releida: { lineas?: CasoLinea[]; triangulado?: boolean } = {}): Promise<CasoLinea[]> {
    const equivalencias = clientId ? (await this.equivalences.findAll(clientId)).map((e) => ({ id: e.id, clientCode: e.clientCode, obenCode: e.obenCode })) : [];
    const peliculas = await this.peliculasConocidas();
    const transfer = releida.triangulado ? (releida.lineas ?? []).find((l) => l.conversiones.some((c) => /precio de transferencia/.test(c))) : undefined;
    return guardadas.map((l, i) => {
      const r = (releida.lineas ?? []).find((x) => x.n === l.n && x.anchoMm === l.anchoMm);
      const enLb = l.unidad != null && /^(lb|lbs|libras?|pounds?)$/i.test(l.unidad.trim());
      const linea = construirLinea(
        i + 1,
        {
          textoCliente: l.textoCliente,
          codigoCliente: l.codigoCliente,
          codigoItem: r?.codigoItem ?? l.codigoItem ?? null,
          cantidad: l.cantidad,
          unidad: l.unidad,
          // El ancho guardado ya está en mm; en libras se vuelve a pulgadas para aplicar el redondeo de EE. UU. (hacia arriba, sin decimales).
          ancho: l.anchoMm ? (enLb ? l.anchoMm / 25.4 : l.anchoMm) : null,
          unidadAncho: l.anchoMm ? (enLb ? 'in' : 'mm') : null,
          espesor: l.espesorMicras,
          unidadEspesor: l.espesorMicras ? 'um' : null,
          precioUnitario: l.precioUnitario,
          moneda: l.moneda,
        },
        equivalencias,
        peliculas,
      );
      // Ya estaba en Ref. Oben (corrección humana o equivalencia): se respeta.
      if (l.codigoOben && !linea.codigoOben) {
        linea.codigoOben = l.codigoOben;
        linea.equivalenciaId = l.equivalenciaId;
        linea.faltantes = linea.faltantes.filter((f) => !/^sin equivalencia/.test(f));
      }
      if (transfer?.precioUnitario) {
        linea.precioUnitario = transfer.precioUnitario;
        linea.moneda = 'USD';
        linea.conversiones = [...linea.conversiones.filter((c) => !/^precio /.test(c)), ...transfer.conversiones.filter((c) => /precio de transferencia/.test(c))];
      }
      return linea;
    });
  }

  /** Lee las líneas de una respuesta del cliente que pide modificar cantidades. */
  async extraerModificacion(caso: ComercialCase, texto: string, config: ComercialConfig): Promise<CasoLinea[]> {
    const equivalencias = caso.clientId
      ? (await this.equivalences.findAll(caso.clientId)).map((e) => ({ id: e.id, clientCode: e.clientCode, obenCode: e.obenCode }))
      : [];
    return (await this.extraer(texto, '', equivalencias, config, null)).lineas;
  }

  async maestro(codigoCliente: string): Promise<MaestroCliente | { error: string }> {
    // Código numérico = CodSec_Entity de Oben: los destinos salen del maestro de clientes REAL de Oben (22-oct).
    if (/^\d+$/.test(codigoCliente.trim()) && this.maestros) return this.maestroOben(Number(codigoCliente));
    const res = await this.hub.call<Record<string, unknown>>('obenPlus', 'cliente.consultar', { codigoCliente }, OBEN_QUERY_OPTIONS);
    if (!res.ok) return { error: `Maestro del cliente ${codigoCliente}: no se pudo consultar OBEN MAS (${res.error ?? 'error desconocido'}).` };
    const d = res.data ?? {};
    const pais = typeof d.pais === 'string' && d.pais.trim() ? d.pais.trim().toUpperCase() : null;
    if (!pais || typeof d.exportacion !== 'boolean' || !Array.isArray(d.direcciones)) {
      return { error: `Maestro del cliente ${codigoCliente}: OBEN MAS no devolvió país, tipo (nacional/exportación) y direcciones.` };
    }
    const direcciones = (d.direcciones as unknown[])
      .map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {}))
      .filter((x) => typeof x.direccion === 'string' && x.direccion.trim())
      .map((x, i) => ({
        id: typeof x.id === 'string' && x.id ? x.id : `DIR-${i + 1}`,
        direccion: String(x.direccion).trim(),
        ciudad: typeof x.ciudad === 'string' ? x.ciudad : null,
        pais: typeof x.pais === 'string' && x.pais ? x.pais.toUpperCase() : pais,
      }));
    return {
      pais,
      exportacion: d.exportacion,
      direcciones,
      comercialEmail: typeof d.comercialEmail === 'string' && d.comercialEmail ? d.comercialEmail : null,
      simulated: res.mode === 'mock' || d.simulated === true,
    };
  }

  /**
   * Maestro del cliente desde Oben (APICustomerParadixe): una fila por destino. El id de cada dirección es el
   * CodSed_CustomerAddress, el mismo que pide la proforma en OBEN MAS.
   */
  private async maestroOben(codSecEntity: number): Promise<MaestroCliente | { error: string }> {
    try {
      const r = await this.maestros!.maestro('clientes', { buscar: String(codSecEntity), limite: 1000 });
      const filas = r.items.filter((f) => Number(f.CodSec_Entity) === codSecEntity);
      if (filas.length === 0) return { error: `Maestro del cliente ${codSecEntity}: Oben no lo tiene en su maestro de clientes.` };
      const t = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
      const pais = t(filas[0].Pais_Cliente).toUpperCase() || 'SIN PAÍS';
      return {
        pais,
        exportacion: pais !== 'COLOMBIA',
        direcciones: filas.map((f) => ({
          id: String(f.CodSed_CustomerAddress),
          direccion: `${t(f.Target_Customer)} — ${t(f.Direccion_Destino).replace(/\s*[\r\n]+\s*/g, ', ')}`,
          ciudad: null,
          pais: (t(f.Pais_Cliente) || pais).toUpperCase(),
        })),
        comercialEmail: null,
        simulated: r.simulado,
      };
    } catch (err) {
      return { error: `Maestro del cliente ${codSecEntity}: no se pudo consultar el maestro de clientes de Oben (${(err as Error).message}).` };
    }
  }

  /**
   * Destino (reunión, 26:19 y 1:08:52): nacional = la dirección creada del
   * cliente; exportación = la que trae la orden de compra, que debe existir
   * entre las direcciones creadas del cliente. Con varias direcciones y
   * ninguna identificable, no se escoge una: queda como faltante.
   */
  resolverDestino(maestro: MaestroCliente | null, direccionOc: string | null, textoOrden?: string): CasoDestino | { error: string } | null {
    if (!maestro) return null;
    const dirs = maestro.direcciones;
    if (dirs.length === 0) return { error: 'El cliente no tiene ninguna dirección de entrega creada en OBEN MAS.' };
    const enOrden = dirs.length > 1 && textoOrden?.trim() ? mejorDireccion(textoOrden, dirs, 0.8) : null;
    if (direccionOc) {
      const match = mejorDireccion(direccionOc, dirs) ?? enOrden;
      if (match) return { direccion: match.direccion, ciudad: match.ciudad, pais: match.pais, direccionId: match.id, fuente: 'orden_compra' };
      return {
        error: `La dirección de la orden de compra ("${direccionOc.slice(0, 120)}") no coincide con ninguna dirección creada del cliente en OBEN MAS — créala allí o escoge una.`,
      };
    }
    if (enOrden) return { direccion: enOrden.direccion, ciudad: enOrden.ciudad, pais: enOrden.pais, direccionId: enOrden.id, fuente: 'orden_compra' };
    if (dirs.length === 1) {
      const d = dirs[0];
      return { direccion: d.direccion, ciudad: d.ciudad, pais: d.pais, direccionId: d.id, fuente: 'maestro' };
    }
    return { error: `El cliente tiene ${dirs.length} direcciones de entrega y la orden de compra no indica cuál — escoge una.` };
  }

  private async extraer(
    texto: string,
    asunto: string,
    equivalencias: EquivalenciaRef[],
    config: ComercialConfig,
    client: Client | null,
  ): Promise<OcExtraccion> {
    const clienteFinalEnAsunto = client?.finalCustomerInSubject ?? false;
    const peliculasConocidas = await this.peliculasConocidas();
    if (config.extractor.provider === 'ollama') {
      try {
        return await extraerConIa(config.extractor, { texto, asunto, equivalencias, ejemplos: config.ejemplosOc, clienteFinalEnAsunto, peliculasConocidas });
      } catch (err) {
        this.logger.warn(`Lectura de OC con IA falló (${(err as Error).message}); se usa la lectura por reglas.`);
        const r = await this.conRespaldoIa(extraerConReglas(texto, asunto, equivalencias, { clienteFinalEnAsunto, peliculasConocidas }), texto, asunto, equivalencias, config, clienteFinalEnAsunto, peliculasConocidas);
        return { ...r, notas: [`La IA no respondió (${(err as Error).message}): se leyó la orden por reglas.`, ...r.notas] };
      }
    }
    return this.conRespaldoIa(extraerConReglas(texto, asunto, equivalencias, { clienteFinalEnAsunto, peliculasConocidas }), texto, asunto, equivalencias, config, clienteFinalEnAsunto, peliculasConocidas);
  }

  /** Las películas de Oben que ya aparecen en las equivalencias de cualquier cliente ("SC---0025TN"): sirven para inferir "SC 25". */
  private async peliculasConocidas(): Promise<string[]> {
    const lista = new Set<string>();
    try {
      for (const e of await this.equivalences.findAll()) {
        const c = e.obenCode.trim().toUpperCase();
        if (/^[A-Z]+-*\d{4}[A-Z]{2}$/.test(c)) lista.add(c);
      }
    } catch {
      /* sin equivalencias previas */
    }
    // Todas las películas del maestro de referencias de Oben: con "SC 17" o "ML 15" basta para saber cuál es si hay una sola.
    try {
      if (this.maestros) for (const p of await this.maestros.peliculas()) lista.add(p);
    } catch {
      /* el maestro no respondió: queda lo de las equivalencias */
    }
    return [...lista];
  }

  /**
   * Las reglas solo entienden listas tipo "- BOPP 15, 1.000 kg, ancho 425 mm". Cuando no encuentran ninguna línea pero hay
   * texto (una tabla leída de un pantallazo o PDF escaneado, o un correo en prosa), se las pasa a la IA de OpenRouter
   * (3-nov). Lo que la IA entregue se marca para verificar; si falla o no halla nada, queda el resultado de las reglas.
   */
  private async conRespaldoIa(
    reglas: OcExtraccion,
    texto: string,
    asunto: string,
    equivalencias: EquivalenciaRef[],
    config: ComercialConfig,
    clienteFinalEnAsunto: boolean,
    peliculasConocidas: string[] = [],
  ): Promise<OcExtraccion> {
    // Las reglas dejan líneas sin producto ni ancho cuando el correo está en prosa ("SC 25 - 640" arriba, "7.500 KILOS" abajo).
    // Una línea de las reglas "sirve" solo si quedó COMPLETA (producto, kilos, ancho y precio): un renglón suelto de un hilo viejo
    // ("mínimo 1 FCL 40", 23,5 tons") no es el pedido (4-nov, Mega Goglio): entonces se prueba la IA y gana la lectura más completa.
    const completas = (e: OcExtraccion) => e.lineas.filter((l) => l.faltantes.length === 0).length;
    if (completas(reglas) > 0 || !this.ia || texto.trim().length < 40) return reglas;
    try {
      const r = await extraerConIa({ host: '', model: 'openrouter' }, { texto, asunto, equivalencias, ejemplos: config.ejemplosOc, clienteFinalEnAsunto, peliculasConocidas, llm: (p) => this.ia!.completarJson(p) });
      if (r.lineas.length === 0 || completas(r) < completas(reglas)) return reglas;
      return {
        ...r,
        numero: r.numero ?? reglas.numero,
        notas: [...r.notas],
      };
    } catch (err) {
      this.logger.warn(`Lectura de la orden con IA (respaldo) falló: ${(err as Error).message}`);
      return reglas;
    }
  }
}

/**
 * Lo que impide crear la Proforma. Se recalcula después de cada corrección
 * humana. Nunca se rellena un faltante con un supuesto.
 */
export function calcularMissing(
  caso: Partial<ComercialCase>,
  ctx: { client?: Client | null; maestroError?: string | null; destinoError?: string | null } = {},
): string[] {
  const missing: string[] = [];
  if (!caso.clientId) missing.push('Cliente: no identificado (ni por el correo ni por lo que dice la orden de compra).');
  else if (!caso.codigoClienteOben) missing.push(`Cliente ${caso.cliente}: falta su código en OBEN MAS (maestro de clientes).`);
  if (ctx.maestroError) missing.push(ctx.maestroError);
  if (!caso.destino) missing.push(ctx.destinoError ?? 'Destino: no hay una dirección de entrega del cliente para esta orden.');
  if (ctx.client?.finalCustomerInSubject && !caso.clienteFinal) {
    missing.push('Cliente final: este cliente es intermediario y el asunto del correo no lo indica.');
  }
  const lineas = caso.lineas ?? [];
  if (lineas.length === 0) missing.push('Líneas: la orden de compra no tiene ninguna línea de producto legible.');
  // Cliente real de Oben (código numérico): la Proforma se crea en OBEN MAS y su API exige el precio de cada línea.
  const real = /^\d+$/.test(caso.codigoClienteOben ?? '');
  for (const l of lineas) {
    for (const f of l.faltantes) missing.push(`Línea ${l.n} ("${l.textoCliente.slice(0, 50)}"): ${f}`);
    if (real && !(Number(l.precioUnitario) > 0)) missing.push(`Línea ${l.n} ("${l.textoCliente.slice(0, 50)}"): precio por kilo (OBEN MAS lo pide para crear la Proforma)`);
  }
  return missing;
}

/** Faltantes de una línea después de una corrección humana. */
export function faltantesLinea(l: CasoLinea): string[] {
  const f: string[] = [];
  if (!l.codigoOben) f.push(`sin equivalencia para "${l.codigoCliente ?? l.textoCliente.slice(0, 60)}" — agrégala en Equivalencias o corrige la línea`);
  if (!l.kilos || l.kilos <= 0) f.push('cantidad en kg o lb');
  if (!l.anchoMm || l.anchoMm <= 0) f.push('ancho');
  return f;
}

/**
 * La dirección del cliente que más se parece al texto (proporción de sus palabras que aparecen). También se mide solo la
 * dirección, sin el nombre del destino ("AMERICAN PACKAGING CORPORATION — 1 GOLF DRIVE DEERFIELD…"): la orden suele traer la
 * calle y el código postal con otro nombre de bodega. Un empate no se adivina.
 */
function mejorDireccion<T extends { direccion: string; ciudad: string | null }>(texto: string, dirs: T[], minimo = 0.6): T | null {
  const oc = new Set(normTexto(texto).trim().split(' ').filter((t) => t.length >= 3 || /^\d+$/.test(t)));
  const tokensDe = (s: string) => normTexto(s).trim().split(' ').filter((t) => t.length >= 3 || /^\d+$/.test(t));
  let best: T | null = null;
  let bestScore = 0;
  let empate = false;
  for (const d of dirs) {
    const partes = d.direccion.split(' — ');
    const variantes = [`${d.direccion} ${d.ciudad ?? ''}`, ...(partes.length > 1 ? [`${partes.slice(1).join(' ')} ${d.ciudad ?? ''}`] : [])];
    const puntajes = variantes.map(tokensDe).filter((t) => t.length > 0).map((t) => t.filter((x) => oc.has(x)).length / t.length);
    if (puntajes.length === 0) continue;
    const score = Math.max(...puntajes);
    if (score > bestScore) {
      best = d;
      bestScore = score;
      empate = false;
    } else if (score === bestScore && score > 0) {
      empate = true;
    }
  }
  return best && bestScore >= minimo && !empate ? best : null;
}
