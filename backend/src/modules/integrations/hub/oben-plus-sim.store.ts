import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ObenPlusSimProforma } from '../../../entities/oben-plus-sim-proforma.entity';

export const OBEN_PLUS_SIM_STORE = Symbol('OBEN_PLUS_SIM_STORE');

export type SimProformaEstado = 'sin_cubicar' | 'cubicada' | 'retenida' | 'activa';

export interface SimProformaLinea {
  codigoOben: string;
  descripcion: string | null;
  kilos: number;
  /** Cantidad ajustada por Planeación al estándar de empaque (la fija el cubicaje). */
  kilosAjustados: number | null;
  anchoMm: number | null;
  espesorMicras: number | null;
  precioUnitario: number | null;
}

/** Una Proforma creada por el flujo Comercial dentro del SIMULADOR de OBEN MAS. */
export interface SimProformaRecord {
  numberPF: string;
  codigoCliente: string;
  cliente: string;
  exportacion: boolean;
  pais: string;
  direccionEntrega: string;
  ordenCompra: string | null;
  clienteFinal: string | null;
  fechaRequerida: string | null;
  estado: SimProformaEstado;
  anulada: boolean;
  motivoAnulacion: string | null;
  lineas: SimProformaLinea[];
  numberOrderSales: number | null;
  carteraLiberada: boolean;
  fechaLiberacion: string | null;
  fechas: {
    creacion: string;
    produccionInicio: string | null;
    produccionFin: string | null;
    entregaComprometida: string | null;
  };
  historial: Array<{ fecha: string; evento: string }>;
}

export interface ObenPlusSimStore {
  get(tenantId: string, numberPF: string): Promise<SimProformaRecord | null>;
  findByOv(tenantId: string, numberOrderSales: number): Promise<SimProformaRecord | null>;
  list(tenantId: string): Promise<SimProformaRecord[]>;
  save(tenantId: string, record: SimProformaRecord): Promise<void>;
  count(tenantId: string): Promise<number>;
}

/** Store en memoria: tests unitarios y arranques sin base de datos. */
export class InMemoryObenPlusSimStore implements ObenPlusSimStore {
  private readonly rows = new Map<string, SimProformaRecord>();
  private key = (t: string, pf: string) => `${t}|${pf}`;

  async get(tenantId: string, numberPF: string) {
    const r = this.rows.get(this.key(tenantId, numberPF));
    return r ? structuredClone(r) : null;
  }
  async findByOv(tenantId: string, numberOrderSales: number) {
    for (const [k, r] of this.rows) {
      if (k.startsWith(`${tenantId}|`) && r.numberOrderSales === numberOrderSales) return structuredClone(r);
    }
    return null;
  }
  async list(tenantId: string) {
    return [...this.rows.entries()].filter(([k]) => k.startsWith(`${tenantId}|`)).map(([, r]) => structuredClone(r));
  }
  async save(tenantId: string, record: SimProformaRecord) {
    this.rows.set(this.key(tenantId, record.numberPF), structuredClone(record));
  }
  async count(tenantId: string) {
    return (await this.list(tenantId)).length;
  }
}

/** Store persistente (tabla `oben_plus_sim_proformas`, migración 0017). */
@Injectable()
export class TypeOrmObenPlusSimStore implements ObenPlusSimStore {
  constructor(@InjectRepository(ObenPlusSimProforma) private readonly repo: Repository<ObenPlusSimProforma>) {}

  async get(tenantId: string, numberPF: string) {
    const row = await this.repo.findOne({ where: { tenantId, numberPF } });
    return row ? (row.data as unknown as SimProformaRecord) : null;
  }
  async findByOv(tenantId: string, numberOrderSales: number) {
    const row = await this.repo.findOne({ where: { tenantId, numberOrderSales } });
    return row ? (row.data as unknown as SimProformaRecord) : null;
  }
  async list(tenantId: string) {
    const rows = await this.repo.find({ where: { tenantId }, order: { createdAt: 'ASC' } });
    return rows.map((r) => r.data as unknown as SimProformaRecord);
  }
  async save(tenantId: string, record: SimProformaRecord) {
    const existing = await this.repo.findOne({ where: { tenantId, numberPF: record.numberPF } });
    await this.repo.save(
      this.repo.create({
        ...(existing ? { id: existing.id } : {}),
        tenantId,
        numberPF: record.numberPF,
        numberOrderSales: record.numberOrderSales,
        data: record as unknown as Record<string, unknown>,
      }),
    );
  }
  async count(tenantId: string) {
    return this.repo.count({ where: { tenantId } });
  }
}
