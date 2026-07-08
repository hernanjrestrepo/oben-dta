import { Inject, Injectable } from '@nestjs/common';
import { MockAdapterBase } from '../mock-adapter-base';
import { AdapterCapability } from '../adapter.types';
import { SCENARIO_PROVIDER, ScenarioProvider } from '../scenario.types';

/**
 * WhatsApp mock — simula el API de mensajería (WhatsApp Cloud API o similar).
 * Igual que email, guarda mensajes por tenant para inspección durante pruebas.
 */
@Injectable()
export class WhatsAppMockAdapter extends MockAdapterBase {
  readonly system = 'whatsapp';

  private readonly log = new Map<string, Array<{ id: string; to: string; template?: string; text?: string; sentAt: string; deliveryStatus: string }>>();

  constructor(@Inject(SCENARIO_PROVIDER) scenarios: ScenarioProvider) {
    super({}, scenarios);
  }

  capabilities(): AdapterCapability[] {
    return [
      { operation: 'send.text', method: 'write', description: 'Enviar texto libre' },
      { operation: 'send.template', method: 'write', description: 'Enviar plantilla aprobada' },
      { operation: 'log.list', method: 'read', description: 'Log de mensajes por tenant' },
      { operation: 'log.clear', method: 'write', description: 'Vaciar log' },
    ];
  }

  protected operationHandlers() {
    return {
      'send.text': this.wrap((args, ctx) => this.sendText(args, ctx.tenantId), 'send.text'),
      'send.template': this.wrap((args, ctx) => this.sendTemplate(args, ctx.tenantId), 'send.template'),
      'log.list': this.wrap((_, ctx) => this.list(ctx.tenantId), 'log.list'),
      'log.clear': this.wrap((_, ctx) => this.clear(ctx.tenantId), 'log.clear'),
    };
  }

  private sendText(args: Record<string, unknown>, tenantId: string) {
    const to = String(args.to ?? '');
    const text = String(args.text ?? '');
    if (!to) throw new Error('BUSINESS_ERROR: to requerido');
    if (!text) throw new Error('BUSINESS_ERROR: text requerido');
    const record = {
      id: `WA-${Date.now()}`,
      to,
      text,
      sentAt: new Date().toISOString(),
      deliveryStatus: 'DELIVERED',
    };
    const list = this.log.get(tenantId) ?? [];
    list.push(record);
    this.log.set(tenantId, list);
    return record;
  }

  private sendTemplate(args: Record<string, unknown>, tenantId: string) {
    const to = String(args.to ?? '');
    const template = String(args.template ?? '');
    if (!to) throw new Error('BUSINESS_ERROR: to requerido');
    if (!template) throw new Error('BUSINESS_ERROR: template requerido');
    const record = {
      id: `WA-${Date.now()}`,
      to,
      template,
      sentAt: new Date().toISOString(),
      deliveryStatus: 'DELIVERED',
    };
    const list = this.log.get(tenantId) ?? [];
    list.push(record);
    this.log.set(tenantId, list);
    return record;
  }

  private list(tenantId: string) {
    return { messages: this.log.get(tenantId) ?? [] };
  }

  private clear(tenantId: string) {
    const size = (this.log.get(tenantId) ?? []).length;
    this.log.delete(tenantId);
    return { cleared: size };
  }
}
