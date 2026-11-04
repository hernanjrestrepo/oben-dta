import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

/**
 * Tiempo de tránsito por país, puerto de destino e incoterm ("LISTA TRANSITOS.xlsx" de Alejandra Molinares, 4-nov-2026).
 * Sirve para el lead time y para calcular la fecha de despacho (ShipmentDate) de la proforma: fecha de entrega menos los
 * días HÁBILES de tránsito. `paisClave`/`puertoClave` son el nombre sin tildes ni signos, para buscar sin errores de escritura.
 */
@Entity('transit_times')
export class TransitTime extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  pais: string;

  @Column()
  puerto: string;

  /** Sigla normalizada: DDP, DAP, CIF, CFR, FOB, EXW, FCA, CPT, CIP… */
  @Column({ type: 'varchar', length: 16 })
  incoterm: string;

  @Column({ name: 'ocean_days', type: 'int', default: 0 })
  oceanDays: number;

  @Column({ name: 'inland_days', type: 'int', default: 0 })
  inlandDays: number;

  @Column({ name: 'total_days', type: 'int' })
  totalDays: number;

  @Column({ name: 'pais_clave' })
  paisClave: string;

  @Column({ name: 'puerto_clave' })
  puertoClave: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
