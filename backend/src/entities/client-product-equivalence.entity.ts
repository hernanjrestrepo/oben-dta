import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index, Unique } from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';
import { Client } from './client.entity';

/**
 * Homologación cliente↔producto (llamada del 2026-09-23: "un cliente no te
 * manda un SC25TN800" — cada cliente nombra el mismo material a su manera:
 * "BOPP 1" para uno, "BOPP 345" para otro, y ambos son el mismo SC15TN
 * interno de Oben). Alejandra la mantiene hoy a mano; este es el
 * administrador que reemplaza esa hoja de cálculo — todavía no está
 * conectado a ninguna interpretación automática de órdenes de compra (eso
 * depende de la API de OBEN MAS/Oben+, que aún no existe).
 */
@Entity('client_product_equivalences')
@Unique('UQ_client_product_equivalence', ['tenantId', 'clientId', 'clientCode'])
export class ClientProductEquivalence extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Client, { eager: true })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Index()
  @Column({ name: 'client_id' })
  clientId: string;

  /** Cómo nombra el cliente este material en su orden de compra (ej. "BOPP 1", "SC 25 TN 800"). */
  @Column({ name: 'client_code' })
  clientCode: string;

  /** Referencia/código interno real de Oben para ese mismo material (ej. "SC15TN"). */
  @Column({ name: 'oben_code' })
  obenCode: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
