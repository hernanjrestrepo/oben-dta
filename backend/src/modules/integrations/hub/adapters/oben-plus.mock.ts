import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import PDFDocument from 'pdfkit';
import { MockAdapterBase } from '../mock-adapter-base';
import { AdapterCapability } from '../adapter.types';
import { SCENARIO_PROVIDER, ScenarioProvider } from '../scenario.types';

/** Estados de una Proforma en OBEN MAS (blueprint Comercial 2026-09-27). */
export const PROFORMA_ESTADOS = ['sin_cubicar', 'ubicada', 'retenida', 'activa'] as const;
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
}

export interface ObenPlusCartera {
  simulated: true;
  numberPF: string;
  /** Liberación de cartera (validación de cupo que NetSuite releva a OBEN MAS). */
  liberada: boolean;
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

/**
 * Oben+ / OBEN MAS (Comercial) — SIMULADO. Hoy no existe ninguna API de Oben
 * para Proformas, cartera ni cubicaje (ver
 * `Business/oben_comercial_blueprint_2026-09-27.html`, sección 1). Este mock
 * permite construir y probar el módulo Comercial y el flujo de Facturación
 * completo; cuando Oben exponga los stored procedures (mismo patrón de
 * APIConsultaParadixe), se agrega el adapter real y se cambia
 * `integrationConfig.obenPlus.mode` — sin tocar la lógica de negocio.
 *
 * Reglas del simulador:
 *  - TODO payload trae `simulated: true`; los consumidores lo propagan.
 *  - Determinista por número de Proforma (hash), coherente entre
 *    operaciones: `sin_cubicar` → sin plan de cubicaje; `ubicada` → plan, sin
 *    cartera; `retenida` → cartera sin liberar; `activa` → cartera liberada y
 *    carga en curso.
 *  - Las fechas son relativas al día de la consulta (para demos creíbles).
 */
@Injectable()
export class ObenPlusMockAdapter extends MockAdapterBase {
  readonly system = 'obenPlus';

  constructor(@Inject(SCENARIO_PROVIDER) scenarios: ScenarioProvider) {
    super({}, scenarios);
  }

  capabilities(): AdapterCapability[] {
    return [
      { operation: 'proforma.status', method: 'read', description: 'Estado, fechas de producción y dirección de entrega de una Proforma (simulado)' },
      { operation: 'proforma.cartera', method: 'read', description: 'Liberación de cartera de una Proforma (simulado)' },
      { operation: 'proforma.cubicaje', method: 'read', description: 'Contenedores planeados vs cargados, peso y volumen (simulado)' },
      { operation: 'proforma.list', method: 'read', description: 'Proformas en seguimiento, filtrables por cliente/estado (simulado)' },
      { operation: 'proforma.pdf', method: 'read', description: 'PDF de la Proforma (simulado — NO es el documento oficial)' },
    ];
  }

  protected operationHandlers() {
    return {
      'proforma.status': this.wrap((args) => this.status(requirePF(args)), 'proforma.status'),
      'proforma.cartera': this.wrap((args) => this.cartera(requirePF(args)), 'proforma.cartera'),
      'proforma.cubicaje': this.wrap((args) => this.cubicaje(requirePF(args)), 'proforma.cubicaje'),
      'proforma.list': this.wrap((args) => this.list(args), 'proforma.list'),
      'proforma.pdf': this.wrap((args) => this.pdf(requirePF(args)), 'proforma.pdf'),
    };
  }

  /**
   * José fue explícito: el PDF real de la Proforma NO se recrea — ni una letra
   * ni un espacio puede cambiar frente al diseño aprobado por el corporativo;
   * se recibe vía API tal cual. Este es solo un marcador SIMULADO, rotulado en
   * cada página, para poder probar el correo de cierre de Liquidación.
   */
  private async pdf(numberPF: string): Promise<ObenPlusProformaPdf> {
    const status = this.status(numberPF);
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
    const liberada = estado === 'activa';
    return {
      simulated: true,
      numberPF,
      liberada,
      fechaLiberacion: liberada ? addDays(fechas.creacion, 2) : null,
      observacion:
        estado === 'retenida'
          ? 'Retenida: pendiente de validación de cupo/crédito (NetSuite, relevado por OBEN MAS).'
          : liberada
            ? 'Cartera liberada.'
            : 'Aún no aplica: la Proforma no ha sido aprobada por el cliente.',
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

  private list(args: Record<string, unknown>): ObenPlusProformaList {
    const cliente = typeof args.cliente === 'string' ? args.cliente.trim().toLowerCase() : '';
    const estado = typeof args.estado === 'string' ? args.estado : '';
    if (estado && !(PROFORMA_ESTADOS as readonly string[]).includes(estado)) {
      throw new Error(`BUSINESS_ERROR: estado inválido (${PROFORMA_ESTADOS.join(', ')})`);
    }
    const proformas = CATALOGO_SIMULADO.map((pf) => this.status(pf)).filter(
      (p) => (!cliente || p.cliente.toLowerCase() === cliente) && (!estado || p.estado === estado),
    );
    return { simulated: true, proformas };
  }
}

function requirePF(args: Record<string, unknown>): string {
  const raw = args.numberPF;
  const numberPF = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  if (!numberPF) throw new Error('BUSINESS_ERROR: numberPF requerido');
  return numberPF;
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
