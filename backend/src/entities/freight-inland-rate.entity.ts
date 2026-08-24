import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

/**
 * Maestro de tarifas de flete terrestre (Inland/Canada) — cargado desde la
 * hoja de tarifas real que envía Oben (ej. "Oben - Leg 3_USA Rates August
 * 2026.xlsx", ver `Business/`). Es tabla de referencia (lookup), no
 * transaccional — se reemplaza completa en cada carga nueva del forwarder
 * (`importedAt`/`sourceFile` quedan como rastro de auditoría de cuál carga
 * dejó cada fila).
 */
@Entity('freight_inland_rates')
export class FreightInlandRate extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 8 })
  country: 'USA' | 'CA';

  @Column()
  forwarder: string;

  @Column({ name: 'destination_port' })
  destinationPort: string;

  @Index()
  @Column()
  state: string;

  @Column({ name: 'destination_address' })
  destinationAddress: string;

  @Column({ name: 'weight_lbs', type: 'int', nullable: true })
  weightLbs: number | null;

  @Column({ name: 'rate_40hc', type: 'decimal', precision: 12, scale: 2 })
  rate40hc: number;

  @Column({ name: 'transit_time_days', type: 'int', nullable: true })
  transitTimeDays: number | null;

  @Column({ name: 'valid_until', type: 'date', nullable: true })
  validUntil: string | null;

  @Column({ name: 'source_file' })
  sourceFile: string;

  @CreateDateColumn({ name: 'imported_at', type: 'timestamptz' })
  importedAt: Date;
}
