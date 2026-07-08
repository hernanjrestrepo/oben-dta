import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 64 })
  key: string;

  @Column({ length: 128 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'price_monthly', type: 'decimal', precision: 12, scale: 2, default: 0 })
  priceMonthly: number;

  @Column({ length: 8, default: 'USD' })
  currency: string;

  @Column({ name: 'max_users', type: 'int', default: 0 })
  maxUsers: number;

  @Column({ name: 'max_storage_gb', type: 'int', default: 0 })
  maxStorageGb: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
