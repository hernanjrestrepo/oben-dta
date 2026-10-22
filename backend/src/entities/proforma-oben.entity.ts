import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

/**
 * Estado de una proforma creada en OBEN MAS desde Oben Xmart:
 *  - pendiente: aún no se pidió el encabezado (o falló antes de crearlo).
 *  - encabezado: Oben creó el encabezado; faltan líneas de detalle.
 *  - creada: encabezado + todas las líneas (equivale a "sin cubicar" en OBEN MAS).
 *  - ov_creada: Oben creó la orden de venta.
 *  - activa: la orden de venta quedó activa (empieza producción).
 *  - revisar: Oben no respondió a tiempo en una escritura: puede haberse hecho; verificar antes de seguir.
 */
export type EstadoProformaOben = 'pendiente' | 'encabezado' | 'creada' | 'ov_creada' | 'activa' | 'revisar';

export interface PasoProformaOben {
  paso: 'validar' | 'encabezado' | 'detalle' | 'ov' | 'activar';
  linea?: number;
  ok: boolean;
  respuesta: string;
  en: string;
  por?: string | null;
}

export interface LineaProformaOben {
  codSecProduct: number;
  referencia: string;
  linea: string | null;
  kilos: number;
  precio: number;
  codSecTariff: number;
  partida: string | null;
  etiqueta: string;
  numeroParte: string;
  /** true cuando Oben ya creó esta línea del detalle. */
  creada: boolean;
}

@Entity('proformas_oben')
export class ProformaOben extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 'pruebas' o 'produccion' (según la URL de las APIs comerciales cuando se creó). */
  @Column({ type: 'varchar', length: 20 })
  servidor: string;

  @Column({ name: 'orden_compra', type: 'varchar', length: 100 })
  ordenCompra: string;

  /** Número OFICIAL de la proforma ("Number PF"): con el que Comercial y todos hacen seguimiento. */
  @Column({ name: 'numero_pf', type: 'varchar', length: 30, nullable: true })
  numeroPF: string | null;

  /** CodSec_SalesOrderHeadPF: código interno del encabezado en Oben (lo piden el detalle, la OV y la activación). */
  @Column({ name: 'codigo_interno', type: 'int', nullable: true })
  codigoInterno: number | null;

  @Column({ type: 'varchar', length: 30, default: 'pendiente' })
  estado: EstadoProformaOben;

  @Column({ type: 'varchar', length: 255, nullable: true })
  cliente: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  destino: string | null;

  /** Lo que pidió el usuario. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  entrada: Record<string, unknown>;

  /** Los 35 valores del encabezado tal como se envían a Oben. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  encabezado: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  lineas: LineaProformaOben[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  pasos: PasoProformaOben[];

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ name: 'creado_por', type: 'uuid', nullable: true })
  creadoPor: string | null;

  @Column({ name: 'creado_por_nombre', type: 'varchar', length: 255, nullable: true })
  creadoPorNombre: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
