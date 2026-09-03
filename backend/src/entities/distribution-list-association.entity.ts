import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';
import { DistributionList } from './distribution-list.entity';

export type DistributionEntityType = 'document' | 'transaction' | 'report';

@Entity('distribution_list_associations')
export class DistributionListAssociation extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => DistributionList, (l) => l.associations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'distribution_list_id' })
  distributionList: DistributionList;

  @Column({ name: 'distribution_list_id' })
  distributionListId: string;

  @Column({ name: 'entity_type' })
  entityType: DistributionEntityType;

  /** Ej: 'packing_list', 'invoice', 'quote_international'. Libre, no un enum cerrado. */
  @Column({ name: 'entity_key' })
  entityKey: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
