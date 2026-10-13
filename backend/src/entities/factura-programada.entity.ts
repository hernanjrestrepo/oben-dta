import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

/**
 * - completa: pedido completo; se factura al cerrar (sale su Lista de Empaque).
 * - parcial: orden con saldo pendiente; se factura con su correo "Facturar Parcial" (número de distribución).
 */
export type TipoFacturaProgramada = 'completa' | 'parcial';

/**
 * Orden que Oben programó para facturar en una fecha (WO-032, reunión del 2026-10-08): con
 * `settings.facturacion.soloProgramadas` la facturación automática solo factura lo programado para hoy.
 */
@Entity('facturacion_programada')
@Unique('uq_facturacion_programada_dia_ov', ['tenantId', 'fecha', 'numberOrderSales'])
export class FacturaProgramada extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Día de factura (AAAA-MM-DD, hora de Bogotá). */
  @Column({ type: 'date' })
  fecha: string;

  @Column({ name: 'number_order_sales', type: 'int' })
  numberOrderSales: number;

  @Column({ name: 'number_pf', type: 'varchar', length: 20 })
  numberPF: string;

  @Column({ type: 'varchar', length: 10, default: 'completa' })
  tipo: TipoFacturaProgramada;

  /** Estado que traía la orden en el cuadro de Oben (CERRADA, POR CERRAR, SALDO PENDIENTE...): solo informativo. */
  @Column({ name: 'estado_oben', type: 'varchar', length: 40, nullable: true })
  estadoOben: string | null;

  @Column({ type: 'varchar', nullable: true })
  cliente: string | null;

  @Column({ name: 'cargada_por', type: 'uuid', nullable: true })
  cargadaPor: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
