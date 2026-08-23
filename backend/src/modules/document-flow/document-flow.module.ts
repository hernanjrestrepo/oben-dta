import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentFlowRule } from '../../entities/document-flow-rule.entity';
import { WorkflowEvent } from '../../entities/workflow-event.entity';
import { AuthModule } from '../auth/auth.module';
import { DocumentFlowEngine } from './document-flow.engine';
import { DocumentFlowRulesService } from './document-flow-rules.service';
import { DocumentFlowRulesController } from './document-flow-rules.controller';
import { DocumentFlowMetricsService } from './document-flow-metrics.service';
import { DocumentFlowMetricsController } from './document-flow-metrics.controller';
import { DocumentSourceRegistry } from './document-source.registry';
import { ActionExecutorRegistry } from './action-executor.registry';
import { ValidatorRegistry } from './validator.registry';
import { GeneratedDocumentAdapter } from './sources/generated-document.adapter';
import { ManualUploadAdapter } from './sources/manual-upload.adapter';
import { OracleAdapter } from './sources/oracle.adapter';
import { ExternalAttachmentAdapter } from './sources/external-attachment.adapter';
import { SendEmailAction } from './actions/send-email.action';

/**
 * Motor de Orquestación Documental — infraestructura pura (Fase 1). No
 * contiene lógica de ningún proceso de negocio; los flujos (cotización, PO,
 * COMEX, navieras) se construyen en Fase 2 sobre `DocumentFlowEngine.handle()`
 * y sus propias `DocumentFlowRule` + generadores, sin modificar este módulo.
 *
 * IntegrationHubModule y SecurityModule son `@Global()` (IntegrationHubService
 * y WorkflowAuditService ya están disponibles sin importarlos aquí).
 */
@Module({
  imports: [TypeOrmModule.forFeature([DocumentFlowRule, WorkflowEvent]), AuthModule],
  controllers: [DocumentFlowRulesController, DocumentFlowMetricsController],
  providers: [
    DocumentFlowEngine,
    DocumentFlowRulesService,
    DocumentFlowMetricsService,
    DocumentSourceRegistry,
    ActionExecutorRegistry,
    ValidatorRegistry,
    GeneratedDocumentAdapter,
    ManualUploadAdapter,
    OracleAdapter,
    ExternalAttachmentAdapter,
    SendEmailAction,
  ],
  exports: [
    DocumentFlowEngine,
    GeneratedDocumentAdapter,
    ActionExecutorRegistry,
    ValidatorRegistry,
  ],
})
export class DocumentFlowModule {}
