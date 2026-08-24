import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

/** Maestro de tarifas de transloading (misma hoja de tarifas, pestaña "Transload"). */
@Entity('freight_transload_rates')
export class FreightTransloadRate extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'destination_port', type: 'varchar', nullable: true })
  destinationPort: string | null;

  @Column({ name: 'delivery_address' })
  deliveryAddress: string;

  @Column({ name: 'unit_weight_lbs', type: 'int', nullable: true })
  unitWeightLbs: number | null;

  @Column({ name: 'transloading_rate', type: 'decimal', precision: 12, scale: 2 })
  transloadingRate: number;

  @Column({ name: 'transportation_rate', type: 'decimal', precision: 12, scale: 2 })
  transportationRate: number;

  @Column({ name: 'validity_note', type: 'varchar', nullable: true })
  validityNote: string | null;

  @Column({ name: 'source_file' })
  sourceFile: string;

  @CreateDateColumn({ name: 'imported_at', type: 'timestamptz' })
  importedAt: Date;
}
