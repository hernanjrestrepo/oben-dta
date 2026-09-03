import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';
import { DistributionListRecipient } from './distribution-list-recipient.entity';
import { DistributionListAssociation } from './distribution-list-association.entity';

/**
 * Lista de distribución: un grupo con nombre de destinatarios (Para/Copia)
 * reutilizable, que se asocia a uno o más tipos de documento/transacción/
 * reporte (ver DistributionListAssociation) para que el sistema sepa a quién
 * enviar cada cosa sin depender de que alguien escriba el correo a mano.
 */
@Entity('distribution_lists')
export class DistributionList extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @OneToMany(() => DistributionListRecipient, (r) => r.distributionList, { cascade: true })
  recipients: DistributionListRecipient[];

  @OneToMany(() => DistributionListAssociation, (a) => a.distributionList, { cascade: true })
  associations: DistributionListAssociation[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
