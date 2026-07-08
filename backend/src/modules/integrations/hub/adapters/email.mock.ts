import { Inject, Injectable } from '@nestjs/common';
import { MockAdapterBase } from '../mock-adapter-base';
import { AdapterCapability } from '../adapter.types';
import { SCENARIO_PROVIDER, ScenarioProvider } from '../scenario.types';

/**
 * Email mock — SMTP genérico o proveedor tipo SendGrid/SES.
 * Guarda mensajes en memoria por tenant para que la UI de operaciones muestre
 * "cola de salida" y permita inspeccionar payloads durante pruebas/demos.
 */
@Injectable()
export class EmailMockAdapter extends MockAdapterBase {
  readonly system = 'email';

  private readonly outbox = new Map<
    string,
    Array<{
      id: string;
      to: string;
      subject: string;
      body: string;
      sentAt: string;
    }>
  >();

  constructor(@Inject(SCENARIO_PROVIDER) scenarios: ScenarioProvider) {
    super({}, scenarios);
  }

  capabilities(): AdapterCapability[] {
    return [
      { operation: 'send', method: 'write', description: 'Enviar email' },
      {
        operation: 'outbox.list',
        method: 'read',
        description: 'Ver bandeja de salida (por tenant)',
      },
      {
        operation: 'outbox.clear',
        method: 'write',
        description: 'Vaciar bandeja de salida (por tenant)',
      },
    ];
  }

  protected operationHandlers() {
    return {
      send: this.wrap((args, ctx) => this.send(args, ctx.tenantId), 'send'),
      'outbox.list': this.wrap(
        (_, ctx) => this.outboxList(ctx.tenantId),
        'outbox.list',
      ),
      'outbox.clear': this.wrap(
        (_, ctx) => this.outboxClear(ctx.tenantId),
        'outbox.clear',
      ),
    };
  }

  private send(args: Record<string, unknown>, tenantId: string) {
    const to = String(args.to ?? '');
    const subject = String(args.subject ?? '');
    const body = String(args.body ?? '');
    if (!to) throw new Error('BUSINESS_ERROR: to requerido');
    if (!subject) throw new Error('BUSINESS_ERROR: subject requerido');
    const record = {
      id: `MAIL-${Date.now()}`,
      to,
      subject,
      body,
      sentAt: new Date().toISOString(),
    };
    const list = this.outbox.get(tenantId) ?? [];
    list.push(record);
    this.outbox.set(tenantId, list);
    return { ...record, delivered: true };
  }

  private outboxList(tenantId: string) {
    return { messages: this.outbox.get(tenantId) ?? [] };
  }

  private outboxClear(tenantId: string) {
    const size = (this.outbox.get(tenantId) ?? []).length;
    this.outbox.delete(tenantId);
    return { cleared: size };
  }
}
