import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Unique,
} from 'typeorm';
import { Order } from './order.entity';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

@Entity('clients')
@Unique('uq_clients_tenant_client_id', ['tenantId', 'clientId'])
export class Client extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  clientId: string;

  @Column()
  name: string;

  @Column()
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  address: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  creditLimit: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  usedCredit: number;

  @Column({ default: true })
  isActive: boolean;

  /** Código del cliente en OBEN MAS (maestro de clientes de Oben). */
  @Column({ name: 'oben_code', type: 'varchar', nullable: true })
  obenCode: string | null;

  /**
   * Dominios de correo autorizados para este cliente (reunión 2026-09-23,
   * 8:08: "que los dominios sí estén avalados"). Solo se aceptan órdenes de
   * compra y aprobaciones de Proforma que lleguen de uno de estos dominios
   * EXACTOS — un dominio parecido ("drumonltda.com" vs "drumon.ltd.com") no
   * pasa. Vacío = solo el dominio de `email`.
   */
  @Column({ name: 'authorized_domains', type: 'text', array: true, default: () => "'{}'" })
  authorizedDomains: string[];

  /** Comercial de Oben a cargo del cliente: va en copia de la Proforma y recibe el seguimiento de cartera. */
  @Column({ name: 'comercial_email', type: 'varchar', nullable: true })
  comercialEmail: string | null;

  /** El cliente es un intermediario (ej. Oben US): el cliente final viene en el asunto del correo. */
  @Column({ name: 'final_customer_in_subject', type: 'boolean', default: false })
  finalCustomerInSubject: boolean;

  @Column({ name: 'created_by', nullable: true })
  createdBy: string;

  @OneToMany(() => Order, (order) => order.client)
  orders: Order[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
