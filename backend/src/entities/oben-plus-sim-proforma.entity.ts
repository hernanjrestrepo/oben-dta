import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, Unique } from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

/**
 * Estado del SIMULADOR de OBEN MAS (ObenPlusMockAdapter) para las Proformas
 * que el propio flujo Comercial crea en modo simulado (`proforma.crear`).
 * Persistido para que una demo o una prueba de punta a punta sobreviva a un
 * reinicio del backend. Nunca contiene datos reales: los números llevan el
 * prefijo `SIM-` y las OV simuladas arrancan en 9.000.000.
 */
@Entity('oben_plus_sim_proformas')
@Unique('UQ_oben_plus_sim_proforma', ['tenantId', 'numberPF'])
export class ObenPlusSimProforma extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'number_pf' })
  numberPF: string;

  @Index()
  @Column({ name: 'number_order_sales', type: 'int', nullable: true })
  numberOrderSales: number | null;

  @Column({ type: 'jsonb' })
  data: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
