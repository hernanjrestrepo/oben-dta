import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

/**
 * Pata 2 del archivo de fletes de Oben: flete MARÍTIMO de puerto de embarque
 * a puerto (o rampa) de destino, por forwarder y naviera ("Fletes
 * Exportacion_Oben Octubre 2026.xlsx", hoja "Update - Freight Leg2").
 * `destinationPort` va en el mismo formato que `FreightInlandRate.destinationPort`
 * ("Houston, TX (Port)") para empalmar con la pata 3 (Inland). Tabla de
 * referencia: se reemplaza completa en cada carga (migración 0021).
 */
@Entity('freight_ocean_rates')
export class FreightOceanRate extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tal cual el archivo, p. ej. "Cartagena, Colombia (COCTG) - Port". */
  @Column()
  origin: string;

  /** Tal cual el archivo, p. ej. "Houston, TX, United States (USHOU) - Port". */
  @Column()
  destination: string;

  @Index()
  @Column({ name: 'destination_port' })
  destinationPort: string;

  @Column({ name: 'container_type', type: 'varchar', length: 16 })
  containerType: string;

  @Column()
  forwarder: string;

  @Column({ name: 'shipping_line', type: 'varchar', nullable: true })
  shippingLine: string | null;

  @Column({ name: 'transit_points', type: 'varchar', nullable: true })
  transitPoints: string | null;

  @Column({ name: 'transit_days', type: 'int', nullable: true })
  transitDays: number | null;

  @Column({ name: 'rate_total', type: 'decimal', precision: 12, scale: 2 })
  rateTotal: number;

  @Column({ name: 'carrier_destination_charges', type: 'decimal', precision: 12, scale: 2, nullable: true })
  carrierDestinationCharges: number | null;

  @Column({ name: 'is_partial', type: 'boolean', default: false })
  isPartial: boolean;

  @Column({ name: 'effective_date', type: 'date', nullable: true })
  effectiveDate: string | null;

  @Column({ name: 'valid_until', type: 'date', nullable: true })
  validUntil: string | null;

  @Column({ name: 'source_file' })
  sourceFile: string;

  @CreateDateColumn({ name: 'imported_at', type: 'timestamptz' })
  importedAt: Date;
}
