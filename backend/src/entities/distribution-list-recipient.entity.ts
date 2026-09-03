import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';
import { DistributionList } from './distribution-list.entity';

export type DistributionRecipientRole = 'to' | 'cc' | 'bcc';

@Entity('distribution_list_recipients')
export class DistributionListRecipient extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => DistributionList, (l) => l.recipients, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'distribution_list_id' })
  distributionList: DistributionList;

  @Column({ name: 'distribution_list_id' })
  distributionListId: string;

  @Column()
  email: string;

  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 8, default: 'to' })
  role: DistributionRecipientRole;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
