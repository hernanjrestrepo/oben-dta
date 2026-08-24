import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

/**
 * Recargos fijos de destino por país (hoja "Destination Surcharges") — mismos
 * conceptos que espera `spSettlement_Head` de Oben (ImporterSecurityFiling,
 * EntryFee, HarborMaintenamceFee, etc.), por eso `rateFormula` existe además
 * de `rateAmount`: el Harbor Maintenance Fee llega como fórmula ("0.125% del
 * FOB"), no como monto fijo.
 */
@Entity('freight_destination_surcharges')
export class FreightDestinationSurcharge extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  country: string;

  @Column({ name: 'surcharge_name' })
  surchargeName: string;

  @Column({ name: 'rate_amount', type: 'decimal', precision: 12, scale: 4, nullable: true })
  rateAmount: number | null;

  @Column({ name: 'rate_formula', type: 'varchar', nullable: true })
  rateFormula: string | null;

  @Column({ name: 'source_file' })
  sourceFile: string;

  @CreateDateColumn({ name: 'imported_at', type: 'timestamptz' })
  importedAt: Date;
}
