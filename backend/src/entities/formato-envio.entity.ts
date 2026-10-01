import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { TenantScopedEntity } from '../common/tenant/tenant-scoped.entity';

/**
 * Formato editable del correo de un documento/reporte (WO-027): asunto y
 * cuerpo con variables ({ov}, {cliente}, {documentos}...). Sin fila para una
 * clave, el sistema usa su texto por defecto.
 */
@Entity('formatos_envio')
export class FormatoEnvio extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  clave: string;

  @Column({ type: 'varchar', length: 300 })
  asunto: string;

  @Column({ type: 'text' })
  cuerpo: string;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
