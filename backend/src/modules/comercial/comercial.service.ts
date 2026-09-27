import { BadRequestException, Injectable } from '@nestjs/common';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import type { AdapterCallResult } from '../integrations/hub/adapter.types';
import { OBEN_QUERY_OPTIONS } from '../oben-reports/oben-reports.service';
import {
  PROFORMA_ESTADOS,
  type ComercialDashboard,
  type ComercialFuentes,
  type ObenPlusCartera,
  type ObenPlusCubicaje,
  type ObenPlusProformaStatus,
  type ProformaEstado,
  type ProformaListResult,
  type ProformaResumen,
  type ProformaTracking,
} from './comercial.types';

const DAY_MS = 24 * 60 * 60 * 1000;
const PROXIMAS_ENTREGAS_DIAS = 14;
const PENDIENTES: readonly ProformaEstado[] = ['sin_cubicar', 'ubicada', 'retenida'];

const SIGUIENTE_PASO: Record<ProformaEstado, string> = {
  sin_cubicar: 'Cubicaje por Planeación (Cube IQ) para ajustar pallets al contenedor.',
  ubicada: 'Enviar la Proforma al cliente y esperar su respuesta (aprueba / rechaza / modifica).',
  retenida: 'Validación de cartera (cupo/crédito) para liberar la orden de venta.',
  activa: 'Producción y cargue; al cerrar el corte se dispara la Lista de Empaque.',
};

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : null;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const isEstado = (v: unknown): v is ProformaEstado =>
  typeof v === 'string' && (PROFORMA_ESTADOS as readonly string[]).includes(v);
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Comercial / Customer Service (blueprint 2026-09-27, sección 1): seguimiento
 * de Proformas — estado, fechas de producción, cartera y cubicaje — por
 * Proforma y por cliente, más un tablero agregado.
 *
 * Única fuente: el sistema `obenPlus` del Integration Hub, que HOY es solo un
 * simulador (Oben no ha expuesto ninguna API de Proformas). Cada respuesta
 * declara `simulated` y de qué modo salió cada dato (`fuentes`); cuando exista
 * el adapter real y se cambie `integrationConfig.obenPlus.mode`, este servicio
 * no cambia. Solo lectura: no escribe nada en Oben.
 *
 * Mismo principio que Liquidación/Facturación: lo que no se pudo consultar o
 * llegó con una forma inválida se lista en `missing`, nunca se rellena.
 */
@Injectable()
export class ComercialService {
  constructor(private readonly hub: IntegrationHubService) {}

  async getProforma(rawNumberPF: string): Promise<ProformaTracking> {
    const numberPF = this.parsePF(rawNumberPF);
    const fuentes: ComercialFuentes = {};
    const missing: string[] = [];
    let simulated = false;

    // Secuencial a propósito: las APIs de Oben no soportan llamadas
    // concurrentes (ver OBEN_QUERY_OPTIONS / ObenReportsService).
    const statusRes = await this.hub.call<unknown>('obenPlus', 'proforma.status', { numberPF }, OBEN_QUERY_OPTIONS);
    const carteraRes = await this.hub.call<unknown>('obenPlus', 'proforma.cartera', { numberPF }, OBEN_QUERY_OPTIONS);
    const cubicajeRes = await this.hub.call<unknown>('obenPlus', 'proforma.cubicaje', { numberPF }, OBEN_QUERY_OPTIONS);
    for (const [key, res] of [['status', statusRes], ['cartera', carteraRes], ['cubicaje', cubicajeRes]] as const) {
      fuentes[key] = res.mode;
      simulated ||= isSimulated(res);
    }

    const status = this.readPart(statusRes, parseStatus, 'Estado de la Proforma', missing);
    const cartera = this.readPart(carteraRes, parseCartera, 'Cartera', missing);
    const cubicaje = this.readPart(cubicajeRes, parseCubicaje, 'Cubicaje', missing);

    return {
      numberPF,
      simulated,
      fuentes,
      cliente: status?.cliente ?? null,
      estado: status?.estado ?? null,
      exportacion: status?.exportacion ?? null,
      pais: status?.pais ?? null,
      direccionEntrega: status?.direccionEntrega ?? null,
      fechas: status?.fechas ?? null,
      cartera,
      cubicaje: cubicaje
        ? {
            ...cubicaje,
            avanceCargaPct:
              cubicaje.contenedoresPlaneados > 0
                ? Math.round((cubicaje.contenedoresCargados / cubicaje.contenedoresPlaneados) * 100)
                : null,
          }
        : null,
      siguientePaso: status ? SIGUIENTE_PASO[status.estado] : null,
      alertas: status ? this.alertas(status, cartera, cubicaje) : [],
      missing,
    };
  }

  async listProformas(filters: { cliente?: string; estado?: string } = {}): Promise<ProformaListResult> {
    const estado = filters.estado?.trim() || undefined;
    if (estado && !isEstado(estado)) {
      throw new BadRequestException(`estado inválido. Válidos: ${PROFORMA_ESTADOS.join(', ')}`);
    }
    const cliente = filters.cliente?.trim() || undefined;
    const { proformas, simulated, fuentes, missing } = await this.fetchList({ cliente, estado });
    return {
      simulated,
      fuentes,
      proformas: proformas.map((p) => ({
        numberPF: p.numberPF,
        cliente: p.cliente,
        estado: p.estado,
        exportacion: p.exportacion,
        pais: p.pais,
        entregaComprometida: p.fechas.entregaComprometida,
      })) satisfies ProformaResumen[],
      missing,
    };
  }

  async dashboard(): Promise<ComercialDashboard> {
    const { proformas, simulated, fuentes, missing } = await this.fetchList({});
    const porEstado = Object.fromEntries(PROFORMA_ESTADOS.map((e) => [e, 0])) as Record<ProformaEstado, number>;
    const clientes = new Map<string, { cliente: string; total: number; pendientes: number; activas: number }>();
    const hoy = today();
    const limite = new Date(Date.parse(hoy) + PROXIMAS_ENTREGAS_DIAS * DAY_MS).toISOString().slice(0, 10);

    for (const p of proformas) {
      porEstado[p.estado]++;
      const c = clientes.get(p.cliente) ?? { cliente: p.cliente, total: 0, pendientes: 0, activas: 0 };
      c.total++;
      if (PENDIENTES.includes(p.estado)) c.pendientes++;
      if (p.estado === 'activa') c.activas++;
      clientes.set(p.cliente, c);
    }

    return {
      simulated,
      fuentes,
      generadoEn: new Date().toISOString(),
      totales: {
        total: proformas.length,
        pendientes: proformas.filter((p) => PENDIENTES.includes(p.estado)).length,
        activas: porEstado.activa,
        exportacion: proformas.filter((p) => p.exportacion).length,
        nacional: proformas.filter((p) => !p.exportacion).length,
      },
      porEstado,
      porCliente: [...clientes.values()].sort((a, b) => b.total - a.total || a.cliente.localeCompare(b.cliente)),
      retenidasPorCartera: proformas
        .filter((p) => p.estado === 'retenida')
        .map((p) => ({ numberPF: p.numberPF, cliente: p.cliente, creacion: p.fechas.creacion })),
      proximasEntregas: proformas
        .filter((p) => (p.estado === 'activa' || p.estado === 'retenida') && p.fechas.entregaComprometida !== null)
        .filter((p) => p.fechas.entregaComprometida! <= limite)
        .map((p) => ({
          numberPF: p.numberPF,
          cliente: p.cliente,
          entregaComprometida: p.fechas.entregaComprometida!,
          vencida: p.fechas.entregaComprometida! < hoy,
        }))
        .sort((a, b) => a.entregaComprometida.localeCompare(b.entregaComprometida)),
      missing,
    };
  }

  private async fetchList(args: { cliente?: string; estado?: string }) {
    const res = await this.hub.call<unknown>('obenPlus', 'proforma.list', args, OBEN_QUERY_OPTIONS);
    if (!res.ok) {
      throw new BadRequestException(`No se pudo consultar las Proformas en Oben+: ${res.error ?? 'error desconocido'}`);
    }
    const rows = (res.data as { proformas?: unknown } | undefined)?.proformas;
    const list = Array.isArray(rows) ? rows : [];
    const proformas = list.map(parseStatus).filter((p): p is ObenPlusProformaStatus => p !== null);
    const invalid = list.length - proformas.length;
    return {
      proformas,
      simulated: isSimulated(res),
      fuentes: { list: res.mode } satisfies ComercialFuentes,
      missing: [
        ...(Array.isArray(rows) ? [] : ['Oben+ no devolvió una lista de Proformas.']),
        ...(invalid > 0 ? [`${invalid} Proforma(s) llegaron de Oben+ con datos inválidos y no se muestran.`] : []),
      ],
    };
  }

  private readPart<T>(
    res: AdapterCallResult<unknown>,
    parse: (d: unknown) => T | null,
    label: string,
    missing: string[],
  ): T | null {
    if (!res.ok) {
      missing.push(`${label}: no se pudo consultar Oben+ (${res.error ?? 'error desconocido'}).`);
      return null;
    }
    const parsed = parse(res.data);
    if (!parsed) missing.push(`${label}: Oben+ no devolvió datos válidos para esta Proforma.`);
    return parsed;
  }

  private alertas(status: ObenPlusProformaStatus, cartera: ObenPlusCartera | null, cubicaje: ObenPlusCubicaje | null): string[] {
    const alertas: string[] = [];
    if (status.estado === 'retenida' && cartera && !cartera.liberada) {
      alertas.push(`Retenida por cartera${cartera.observacion ? `: ${cartera.observacion}` : '.'}`);
    }
    if (status.estado === 'activa' && cartera && !cartera.liberada) {
      alertas.push('Inconsistencia en Oben+: la orden está activa pero no registra liberación de cartera.');
    }
    const entrega = status.fechas.entregaComprometida;
    const cargaCompleta =
      !!cubicaje && cubicaje.contenedoresPlaneados > 0 && cubicaje.contenedoresCargados >= cubicaje.contenedoresPlaneados;
    if (entrega && entrega < today() && !cargaCompleta) {
      alertas.push(`La entrega comprometida (${entrega}) ya pasó y no hay carga completa registrada.`);
    }
    return alertas;
  }

  private parsePF(raw: string): string {
    const pf = (raw ?? '').trim();
    if (!/^[A-Za-z0-9-]{1,32}$/.test(pf)) {
      throw new BadRequestException('numberPF debe ser un número de Proforma válido');
    }
    return pf;
  }
}

function isSimulated(res: AdapterCallResult<unknown>): boolean {
  return res.mode === 'mock' || (res.data as { simulated?: unknown } | undefined)?.simulated === true;
}

function parseStatus(d: unknown): ObenPlusProformaStatus | null {
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  const numberPF = str(o.numberPF);
  const cliente = str(o.cliente);
  if (!numberPF || !cliente || !isEstado(o.estado) || typeof o.exportacion !== 'boolean') return null;
  const f = (o.fechas && typeof o.fechas === 'object' ? o.fechas : {}) as Record<string, unknown>;
  return {
    numberPF,
    cliente,
    estado: o.estado,
    exportacion: o.exportacion,
    pais: str(o.pais),
    direccionEntrega: str(o.direccionEntrega),
    fechas: {
      creacion: str(f.creacion),
      produccionInicio: str(f.produccionInicio),
      produccionFin: str(f.produccionFin),
      entregaComprometida: str(f.entregaComprometida),
    },
  };
}

function parseCartera(d: unknown): ObenPlusCartera | null {
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  if (typeof o.liberada !== 'boolean') return null;
  return { liberada: o.liberada, fechaLiberacion: str(o.fechaLiberacion), observacion: str(o.observacion) };
}

function parseCubicaje(d: unknown): ObenPlusCubicaje | null {
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  const values = {
    contenedoresPlaneados: num(o.contenedoresPlaneados),
    contenedoresCargados: num(o.contenedoresCargados),
    pesoPlaneadoKg: num(o.pesoPlaneadoKg),
    pesoCargadoKg: num(o.pesoCargadoKg),
    volumenPlaneadoM3: num(o.volumenPlaneadoM3),
    volumenCargadoM3: num(o.volumenCargadoM3),
  };
  if (Object.values(values).some((v) => v === null)) return null;
  return { tipoContenedor: str(o.tipoContenedor), ...(values as Record<keyof typeof values, number>) };
}
