import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DocumentFlowRule,
  DocumentFlowRuleStatus,
} from '../../entities/document-flow-rule.entity';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { BusinessEvent } from './business-event.types';
import { DocumentFlowContext } from './document-flow-context.types';
import { DocumentSourceRegistry } from './document-source.registry';
import { ActionExecutorRegistry } from './action-executor.registry';
import { ValidatorRegistry } from './validator.registry';
import { DocumentSourceType, ResolvedDocument } from './document-source.types';
import { ActionExecutionResult } from './action-executor.types';
import { ValidationResult } from './validator.types';

/** Traza de un documento resuelto: qué adaptador participó y cuánto tardó. */
export interface DocumentTraceEntry {
  key: string;
  source: DocumentSourceType;
  state: ResolvedDocument['state'];
  durationMs: number;
  message?: string;
}

/** Traza de una acción ejecutada: qué tipo, resultado y cuánto tardó. */
export interface ActionTraceEntry {
  type: string;
  status: ActionExecutionResult['status'];
  durationMs: number;
  message?: string;
}

/** Traza de una validación ejecutada: qué tipo, si pasó y cuánto tardó. */
export interface ValidationTraceEntry {
  type: string;
  passed: boolean;
  durationMs: number;
  message?: string;
}

export interface DocumentFlowRuleResult {
  ruleId: string;
  ruleName: string;
  status: 'completed' | 'partial' | 'validation_failed' | 'skipped';
  documents: ResolvedDocument[];
  missingRequired: string[];
  validations: ValidationResult[];
  validationsPassed: boolean;
  failedValidations: string[];
  actions: ActionExecutionResult[];
  /** Observabilidad: responde "qué adaptadores participaron y cuánto tardó cada uno". */
  documentsTrace: DocumentTraceEntry[];
  /** Observabilidad: responde "qué validaciones se ejecutaron, cuáles fallaron y cuánto tardaron". */
  validationsTrace: ValidationTraceEntry[];
  /** Observabilidad: responde "qué acciones se ejecutaron, cuáles fallaron y cuánto tardaron". */
  actionsTrace: ActionTraceEntry[];
  /** Adaptadores de origen realmente invocados en esta ejecución (sin duplicados). */
  sourcesUsed: DocumentSourceType[];
  /** Tipos de acción realmente invocados en esta ejecución (sin duplicados). */
  actionsUsed: string[];
  /** Tiempo total de la regla: documentos + validaciones + acciones. */
  totalDurationMs: number;
}

export interface DocumentFlowResult {
  event: BusinessEvent;
  rules: DocumentFlowRuleResult[];
}

/**
 * Núcleo del Motor de Orquestación Documental.
 *
 * Recibe un `BusinessEvent` + `DocumentFlowContext` y resuelve, únicamente a
 * partir de configuración (`DocumentFlowRule`), qué documentos reunir, de qué
 * fuente sale cada uno, a quién notificar y qué acciones ejecutar — sin saber
 * qué es Oracle, correo, COMEX o una cotización. Fase 2 (cada flujo de
 * negocio) solo dispara `handle()` y registra sus propias reglas/generadores;
 * este archivo no debe cambiar cuando eso ocurra.
 *
 * Cada ejecución de regla queda trazada dos veces: en el `DocumentFlowRuleResult`
 * que se devuelve al llamador (para decisiones en caliente) y en `workflow_events`
 * vía `WorkflowAuditService` (para auditoría/observabilidad histórica, consultable
 * por `GET /auditoria`).
 */
@Injectable()
export class DocumentFlowEngine {
  private readonly logger = new Logger(DocumentFlowEngine.name);

  constructor(
    @InjectRepository(DocumentFlowRule)
    private readonly rules: Repository<DocumentFlowRule>,
    private readonly sources: DocumentSourceRegistry,
    private readonly actionRegistry: ActionExecutorRegistry,
    private readonly validatorRegistry: ValidatorRegistry,
    private readonly audit: WorkflowAuditService,
  ) {}

  async handle(
    event: BusinessEvent,
    context: DocumentFlowContext,
  ): Promise<DocumentFlowResult> {
    const rules = await this.rules.find({
      where: {
        tenantId: context.tenantId,
        triggerEvent: event,
        status: DocumentFlowRuleStatus.ACTIVE,
      },
      order: { priority: 'DESC' },
    });

    if (rules.length === 0) {
      this.logger.debug(
        `Sin DocumentFlowRule activa para evento ${event} (tenant ${context.tenantId})`,
      );
    }

    const results: DocumentFlowRuleResult[] = [];
    for (const rule of rules) {
      results.push(await this.runRule(rule, event, context));
    }

    return { event, rules: results };
  }

  private async runRule(
    rule: DocumentFlowRule,
    event: BusinessEvent,
    context: DocumentFlowContext,
  ): Promise<DocumentFlowRuleResult> {
    const ruleStartedAt = Date.now();
    const documents: ResolvedDocument[] = [];
    const documentsTrace: DocumentTraceEntry[] = [];
    const missingRequired: string[] = [];

    for (const doc of rule.requiredDocuments) {
      const source = this.sources.resolve(doc.source);
      const startedAt = Date.now();
      const resolved: ResolvedDocument = source
        ? await source.resolve({
            key: doc.key,
            sourceConfig: doc.sourceConfig ?? {},
            context,
          })
        : {
            key: doc.key,
            state: 'unavailable',
            message: `DocumentSource "${doc.source}" no registrado`,
          };
      const durationMs = Date.now() - startedAt;
      documents.push(resolved);
      documentsTrace.push({
        key: resolved.key,
        source: doc.source,
        state: resolved.state,
        durationMs,
        message: resolved.message,
      });
      this.logger.debug(
        `[${rule.name}] documento "${doc.key}" (${doc.source}) → ${resolved.state} en ${durationMs}ms`,
      );
      if (doc.required && resolved.state !== 'ready') {
        missingRequired.push(doc.key);
      }
    }

    const readyDocuments = documents.filter((d) => d.state === 'ready');

    const validations: ValidationResult[] = [];
    const validationsTrace: ValidationTraceEntry[] = [];
    if (missingRequired.length === 0) {
      for (const v of rule.validations) {
        const validator = this.validatorRegistry.resolve(v.type);
        const startedAt = Date.now();
        const result: ValidationResult = validator
          ? await validator.validate({ validation: v, context })
          : {
              type: v.type,
              passed: false,
              message: `Validator "${v.type}" no registrado`,
            };
        const durationMs = Date.now() - startedAt;
        validations.push(result);
        validationsTrace.push({
          type: result.type,
          passed: result.passed,
          durationMs,
          message: result.message,
        });
        this.logger.debug(
          `[${rule.name}] validación "${v.type}" → ${result.passed ? 'OK' : 'FALLÓ'} en ${durationMs}ms` +
            (result.message ? ` (${result.message})` : ''),
        );
      }
    }
    const failedValidations = validations
      .filter((v) => !v.passed)
      .map((v) => v.type);
    const validationsPassed = failedValidations.length === 0;

    const actions: ActionExecutionResult[] = [];
    const actionsTrace: ActionTraceEntry[] = [];

    if (missingRequired.length === 0 && validationsPassed) {
      for (const action of rule.actions) {
        const executor = this.actionRegistry.resolve(action.type);
        const startedAt = Date.now();
        const result: ActionExecutionResult = executor
          ? await executor.execute({
              action,
              context,
              documents: readyDocuments,
              recipients: rule.recipients,
            })
          : {
              type: action.type,
              status: 'failed',
              message: `ActionExecutor "${action.type}" no registrado`,
            };
        const durationMs = Date.now() - startedAt;
        actions.push(result);
        actionsTrace.push({
          type: result.type,
          status: result.status,
          durationMs,
          message: result.message,
        });
        this.logger.debug(
          `[${rule.name}] acción "${action.type}" → ${result.status} en ${durationMs}ms` +
            (result.status === 'failed' ? ` (${result.message})` : ''),
        );
      }
    }

    const status: DocumentFlowRuleResult['status'] =
      missingRequired.length > 0
        ? 'partial'
        : !validationsPassed
          ? 'validation_failed'
          : rule.actions.length === 0
            ? 'skipped'
            : 'completed';

    const totalDurationMs = Date.now() - ruleStartedAt;
    const sourcesUsed = Array.from(
      new Set(rule.requiredDocuments.map((d) => d.source)),
    );
    const actionsUsed = Array.from(new Set(rule.actions.map((a) => a.type)));

    await this.audit.log({
      workflowName: 'document_flow',
      action: event,
      entityType: 'DocumentFlowRule',
      entityId: rule.id,
      actorId: context.userId ?? null,
      inputData: { event, ruleName: rule.name, context },
      outputData: {
        status,
        documentsTrace,
        validationsTrace,
        actionsTrace,
        sourcesUsed,
        actionsUsed,
        missingRequired,
        failedValidations,
        totalDurationMs,
      },
    });

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      status,
      documents,
      missingRequired,
      validations,
      validationsPassed,
      failedValidations,
      actions,
      documentsTrace,
      validationsTrace,
      actionsTrace,
      sourcesUsed,
      actionsUsed,
      totalDurationMs,
    };
  }
}
