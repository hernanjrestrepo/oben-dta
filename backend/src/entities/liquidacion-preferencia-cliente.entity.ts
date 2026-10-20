import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

/**
 * Lo que COMEX deja para un cliente en la liquidación (reunión del 20-oct: "que no quede por default, sino que
 * se vaya creando por cliente"): partida NCM y NALADI y el texto que va junto a la partida en la factura. Se
 * guarda al aprobar y se propone en las siguientes proformas del MISMO cliente y la MISMA partida de Oben (un
 * cliente que compra BOPP y PET tiene una preferencia por cada una). Siempre se puede cambiar.
 */
@Entity('liquidacion_preferencias_cliente')
export class LiquidacionPreferenciaCliente extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Nombre del cliente normalizado (mayúsculas, sin tildes ni puntuación). */
  @Column({ name: 'cliente_clave', type: 'varchar', length: 255 })
  clienteClave: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  cliente: string | null;

  /** Partida de Colombia que Oben entrega para los SKU (o los tipos de película), '' si no se sabe. */
  @Column({ name: 'partida_oben', type: 'varchar', length: 64, default: '' })
  partidaOben: string;

  @Column({ name: 'pa_ncm', type: 'varchar', length: 64, nullable: true })
  paNcm: string | null;

  @Column({ name: 'pa_naladi', type: 'varchar', length: 64, nullable: true })
  paNaladi: string | null;

  @Column({ name: 'ncm_descripcion', type: 'text', nullable: true })
  ncmDescripcion: string | null;

  @Column({ name: 'ncm_con_descripcion', type: 'boolean', nullable: true })
  ncmConDescripcion: boolean | null;

  /** Proforma con la que se guardó por última vez. */
  @Column({ name: 'number_pf', type: 'varchar', length: 20, nullable: true })
  numberPF: string | null;

  @Column({ name: 'actualizado_por', type: 'varchar', length: 255, nullable: true })
  actualizadoPor: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
