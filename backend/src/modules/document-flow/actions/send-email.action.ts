import { Injectable } from '@nestjs/common';
import { AdapterRegistry } from '../../integrations/hub/adapter-registry';
import { ResilientAdapterExecutor } from '../../integrations/hub/resilient-adapter-executor';
import {
  ActionExecutionRequest,
  ActionExecutionResult,
  ActionExecutor,
} from '../action-executor.types';

function interpolate(
  template: string,
  context: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const value = path
      .split('.')
      .reduce<unknown>(
        (acc, part) =>
          acc && typeof acc === 'object'
            ? (acc as Record<string, unknown>)[part]
            : undefined,
        context,
      );
    return value === undefined || value === null ? '' : String(value);
  });
}

/**
 * Acción "send_email": arma destinatarios + adjuntos a partir de los
 * documentos ya resueltos y llama al Hub (`email.send`). Cuando el adaptador
 * real de correo (Sprint 2) esté activo, esta acción no cambia — solo cambia
 * el modo del adapter `email` en la config del tenant.
 *
 * Inyecta `AdapterRegistry` directamente (no `IntegrationHubService`) a
 * propósito: `IntegrationHubService` depende de `TenantContext`
 * (request-scoped), lo que volvería request-scoped a esta acción y, en
 * cascada, a `ActionExecutorRegistry` completo — un registry request-scoped
 * no puede recibir `.register()` de acciones nuevas en `onModuleInit()` de
 * otros módulos (no hay "request" en el arranque). El `tenantId`/`userId` ya
 * viajan en `DocumentFlowContext`, así que no hace falta `TenantContext`
 * para resolver el adapter correcto.
 */
@Injectable()
export class SendEmailAction implements ActionExecutor {
  readonly type = 'send_email';

  constructor(
    private readonly adapters: AdapterRegistry,
    private readonly resilientExecutor: ResilientAdapterExecutor,
  ) {}

  async execute(
    request: ActionExecutionRequest,
  ): Promise<ActionExecutionResult> {
    const config = request.action.config ?? {};
    const ctxRecord = request.context as unknown as Record<string, unknown>;
    const to = Array.from(
      new Set(
        request.recipients.flatMap((r) => r.to.map((t) => interpolate(t, ctxRecord))),
      ),
    ).filter(Boolean);
    const cc = Array.from(
      new Set(
        request.recipients.flatMap((r) =>
          (r.cc ?? []).map((c) => interpolate(c, ctxRecord)),
        ),
      ),
    ).filter(Boolean);
    if (to.length === 0) {
      return {
        type: this.type,
        status: 'skipped',
        message: 'Sin destinatarios configurados',
      };
    }
    // metadata.emailSubject/emailBody permite a un flujo de negocio reutilizar
    // una plantilla de render existente (ej. la HTML de cotización actual) tal
    // cual, en vez de reconstruirla como subjectTemplate/bodyTemplate en la
    // regla. Si no vienen, cae a los templates declarativos de la config.
    const subject =
      (request.context.metadata?.emailSubject as string | undefined) ??
      interpolate((config.subjectTemplate as string) ?? 'Notificación Oben Plus', ctxRecord);
    const body =
      (request.context.metadata?.emailBody as string | undefined) ??
      interpolate((config.bodyTemplate as string) ?? '', ctxRecord);
    const attachments = request.documents
      .filter((doc) => doc.state === 'ready' && doc.content)
      .map((doc) => ({
        filename: doc.filename ?? doc.key,
        mimeType: doc.mimeType ?? 'application/octet-stream',
        content: doc.content,
      }));

    const tenantId = request.context.tenantId;
    const adapter = await this.adapters.resolve(tenantId, 'email');
    const result = await this.resilientExecutor.execute(
      adapter,
      'send',
      { to: to.join(','), cc: cc.join(','), subject, body, attachments },
      { tenantId, userId: request.context.userId ?? null },
    );

    if (!result.ok) {
      return {
        type: this.type,
        status: 'failed',
        message: result.error ?? 'email.send falló',
      };
    }
    return {
      type: this.type,
      status: 'executed',
      data: { to, cc, subject, attachmentCount: attachments.length },
    };
  }
}
