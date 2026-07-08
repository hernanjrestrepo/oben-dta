import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  Index,
} from 'typeorm';

@Entity('plan_modules')
@Unique('uq_plan_modules_plan_module', ['planId', 'moduleKey'])
export class PlanModule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'plan_id', type: 'uuid' })
  planId: string;

  @Index()
  @Column({ name: 'module_key', length: 64 })
  moduleKey: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
