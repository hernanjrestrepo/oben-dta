import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { PlatformRole } from './platform-role.entity';

@Entity('platform_user_roles')
@Unique('uq_platform_user_role', ['userId', 'platformRoleId'])
export class PlatformUserRole {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index()
  @Column({ name: 'platform_role_id', type: 'uuid' })
  platformRoleId: string;

  @ManyToOne(() => PlatformRole, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'platform_role_id' })
  platformRole: PlatformRole;

  @Column({ name: 'assigned_by', type: 'uuid', nullable: true })
  assignedBy: string | null;

  @CreateDateColumn({ name: 'assigned_at' })
  assignedAt: Date;
}
