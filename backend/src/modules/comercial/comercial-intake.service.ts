import { Injectable, Logger } from '@nestjs/common';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { OBEN_QUERY_OPTIONS } from '../oben-reports/oben-reports.service';
import { ClientsService } from '../clients/clients.service';
import { EquivalencesService } from '../equivalences/equivalences.service';
import type { Client } from '../../entities/client.entity';
import type { CasoDestino, CasoLinea, ComercialCase } from '../../entities/comercial-case.entity';
import { extraerConIa, extraerConReglas, normTexto, textoDeAdjuntos, type EquivalenciaRef, type OcAdjunto, type OcExtraccion } from './oc-extractor';
import type { ComercialConfig } from './comercial-config';

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

export const MAESTRO_SIMULADO_LABEL = 'Maestro del cliente (país y direcciones) desde el SIMULADOR de OBEN MAS';
export const CLIENTE_DEMO_LABEL = 'Cliente de demostración (dominio de prueba): datos simulados';

/**
 * Orden de compra → caso comercial (reunión 2026-09-23). Identifica al
 * cliente por el dominio EXACTO del remitente, lee la orden (reglas o IA),
 * traduce cada línea con la tabla de equivalencias del cliente, convierte
 * unidades, resuelve el destino contra el maestro del cliente en OBEN MAS y
 * lista TODO lo que falta — nunca rellena un dato.
 */
@Injectable()
export class ComercialIntakeService {
  private readonly logger = new Logger(ComercialIntakeService.name);

  constructor(
    private readonly hub: IntegrationHubService,
    private readonly clients: ClientsService,
    private readonly equivalences: EquivalencesService,
  ) {}

  /** Arma los datos del caso (sin guardarlo). */
  async construir(input: OcEntrada, config: ComercialConfig): Promise<Partial<ComercialCase>> {
    const from = input.from.trim().toLowerCase();
    const dominio = (from.split('@')[1] ?? '').trim();
    const { client, ambiguous } = await this.clients.findByEmailDomain(dominio);
    const atencion: string[] = [];
    if (!client) {
      atencion.push(
        ambiguous
          ? `El dominio "${dominio}" está autorizado para más de un cliente: no se puede saber de quién es la orden — asígnala a mano.`
          : `Remitente NO autorizado: el dominio "${dominio}" no pertenece a ningún cliente registrado (posible suplantación). No se procesa sin revisión.`,
      );
    }

    const adj = await textoDeAdjuntos(input.attachments ?? []);
    const texto = [input.body, adj.texto].filter(Boolean).join('\n');
    const equivalencias: EquivalenciaRef[] = client
      ? (await this.equivalences.findAll(client.id)).map((e) => ({ id: e.id, clientCode: e.clientCode, obenCode: e.obenCode }))
      : [];

    const extraccion = await this.extraer(texto, input.subject, equivalencias, config, client);
    const maestro = client?.obenCode ? await this.maestro(client.obenCode) : null;
    const destino = maestro && 'error' in maestro ? null : this.resolverDestino(maestro, extraccion.direccionEntrega);

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

  /** Lee las líneas de una respuesta del cliente que pide modificar cantidades. */
  async extraerModificacion(caso: ComercialCase, texto: string, config: ComercialConfig): Promise<CasoLinea[]> {
    const equivalencias = caso.clientId
      ? (await this.equivalences.findAll(caso.clientId)).map((e) => ({ id: e.id, clientCode: e.clientCode, obenCode: e.obenCode }))
      : [];
    return (await this.extraer(texto, '', equivalencias, config, null)).lineas;
  }

  async maestro(codigoCliente: string): Promise<MaestroCliente | { error: string }> {
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
   * Destino (reunión, 26:19 y 1:08:52): nacional = la dirección creada del
   * cliente; exportación = la que trae la orden de compra, que debe existir
   * entre las direcciones creadas del cliente. Con varias direcciones y
   * ninguna identificable, no se escoge una: queda como faltante.
   */
  resolverDestino(maestro: MaestroCliente | null, direccionOc: string | null): CasoDestino | { error: string } | null {
    if (!maestro) return null;
    const dirs = maestro.direcciones;
    if (dirs.length === 0) return { error: 'El cliente no tiene ninguna dirección de entrega creada en OBEN MAS.' };
    if (direccionOc) {
      const match = mejorDireccion(direccionOc, dirs);
      if (match) return { direccion: match.direccion, ciudad: match.ciudad, pais: match.pais, direccionId: match.id, fuente: 'orden_compra' };
      return {
        error: `La dirección de la orden de compra ("${direccionOc.slice(0, 120)}") no coincide con ninguna dirección creada del cliente en OBEN MAS — créala allí o escoge una.`,
      };
    }
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
    if (config.extractor.provider === 'ollama') {
      try {
        return await extraerConIa(config.extractor, { texto, asunto, equivalencias, ejemplos: config.ejemplosOc, clienteFinalEnAsunto });
      } catch (err) {
        this.logger.warn(`Lectura de OC con IA falló (${(err as Error).message}); se usa la lectura por reglas.`);
        const r = extraerConReglas(texto, asunto, equivalencias, { clienteFinalEnAsunto });
        return { ...r, notas: [`La IA no respondió (${(err as Error).message}): se leyó la orden por reglas.`, ...r.notas] };
      }
    }
    return extraerConReglas(texto, asunto, equivalencias, { clienteFinalEnAsunto });
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
  if (!caso.clientId) missing.push('Cliente: no identificado por el dominio del remitente.');
  else if (!caso.codigoClienteOben) missing.push(`Cliente ${caso.cliente}: falta su código en OBEN MAS (maestro de clientes).`);
  if (ctx.maestroError) missing.push(ctx.maestroError);
  if (!caso.destino) missing.push(ctx.destinoError ?? 'Destino: no hay una dirección de entrega del cliente para esta orden.');
  if (ctx.client?.finalCustomerInSubject && !caso.clienteFinal) {
    missing.push('Cliente final: este cliente es intermediario y el asunto del correo no lo indica.');
  }
  const lineas = caso.lineas ?? [];
  if (lineas.length === 0) missing.push('Líneas: la orden de compra no tiene ninguna línea de producto legible.');
  for (const l of lineas) {
    for (const f of l.faltantes) missing.push(`Línea ${l.n} ("${l.textoCliente.slice(0, 50)}"): ${f}`);
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

function mejorDireccion<T extends { direccion: string; ciudad: string | null }>(texto: string, dirs: T[]): T | null {
  const oc = new Set(normTexto(texto).trim().split(' ').filter((t) => t.length >= 3 || /^\d+$/.test(t)));
  let best: T | null = null;
  let bestScore = 0;
  let empate = false;
  for (const d of dirs) {
    const tokens = normTexto(`${d.direccion} ${d.ciudad ?? ''}`).trim().split(' ').filter((t) => t.length >= 3 || /^\d+$/.test(t));
    if (tokens.length === 0) continue;
    const score = tokens.filter((t) => oc.has(t)).length / tokens.length;
    if (score > bestScore) {
      best = d;
      bestScore = score;
      empate = false;
    } else if (score === bestScore && score > 0) {
      empate = true;
    }
  }
  return best && bestScore >= 0.6 && !empate ? best : null;
}
