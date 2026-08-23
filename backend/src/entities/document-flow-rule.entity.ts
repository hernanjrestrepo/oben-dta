import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import type { DocumentSourceType } from '../modules/document-flow/document-source.types';
import type { BusinessEvent } from '../modules/document-flow/business-event.types';
import type { ActionType } from '../modules/document-flow/action-type.types';
import type { IntegrationSystem } from '../modules/integrations/hub/adapter.types';

export enum DocumentFlowRuleStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DRAFT = 'draft',
}

export interface DocumentFlowRequiredDocument {
  key: string;
  label: string;
  source: DocumentSourceType;
  required: boolean;
  sourceConfig?: Record<string, unknown>;
}

export interface DocumentFlowRecipient {
  label: string;
  to: string[];
  cc?: string[];
}

export interface DocumentFlowAction {
  type: ActionType;
  config?: Record<string, unknown>;
}

export interface DocumentFlowIntegration {
  system: IntegrationSystem;
  purpose?: string;
}

export interface DocumentFlowValidation {
  type: string;
  config?: Record<string, unknown>;
}

/**
 * Configuración declarativa de un flujo documental: qué evento lo dispara,
 * qué documentos requiere (y de dónde salen), a quién van, qué acciones e
 * integraciones ejecuta. El `DocumentFlowEngine` solo interpreta filas de
 * esta tabla — agregar un proceso de negocio nuevo es insertar una fila, no
 * tocar código del motor.
 */
@Entity('document_flow_rules')
export class DocumentFlowRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Index()
  @Column({ name: 'trigger_event', type: 'varchar', length: 64 })
  triggerEvent: BusinessEvent;

  @Column({
    name: 'required_documents',
    type: 'jsonb',
    default: () => "'[]'",
  })
  requiredDocuments: DocumentFlowRequiredDocument[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  recipients: DocumentFlowRecipient[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  actions: DocumentFlowAction[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  integrations: DocumentFlowIntegration[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  validations: DocumentFlowValidation[];

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({
    type: 'enum',
    enum: DocumentFlowRuleStatus,
    default: DocumentFlowRuleStatus.DRAFT,
  })
  status: DocumentFlowRuleStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
