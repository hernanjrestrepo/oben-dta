import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { BaseAdapter } from '../base-adapter';
import {
  AdapterCapability,
  AdapterCallContext,
  AdapterMode,
  AdapterState,
  BaseAdapterConfig,
} from '../adapter.types';

export interface EmailSmtpAdapterConfig extends BaseAdapterConfig {
  host?: string;
  port?: number;
  /** STARTTLS (587) vs TLS implícito (465). false = STARTTLS. */
  secure?: boolean;
  user?: string;
  pass?: string;
  fromAddress?: string;
}

/**
 * Adapter Real de envío de correo vía SMTP (Microsoft 365 / cualquier SMTP
 * estándar). Complementa al conector IMAP de entrada (`ImapConnectorService`,
 * módulo `email-intake`) — este adapter solo cubre el lado de SALIDA, y sigue
 * exactamente el mismo contrato `IntegrationAdapter` que el resto del hub
 * (WO-018 Sprint 6 — "conector de correo real", requisito 2 del usuario).
 */
@Injectable()
export class EmailSmtpRealAdapter extends BaseAdapter {
  readonly system = 'email';
  readonly mode: AdapterMode = 'real';

  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly smtpConfig: EmailSmtpAdapterConfig) {
    super(smtpConfig);
  }

  capabilities(): AdapterCapability[] {
    return [{ operation: 'send', method: 'write', description: 'Enviar email vía SMTP real' }];
  }

  private isConfigured(): boolean {
    const c = this.smtpConfig;
    return !!(c.host && c.port && c.user && c.pass && c.fromAddress);
  }

  protected async checkHealth(): Promise<AdapterState> {
    if (!this.isConfigured()) return 'pending_credentials';
    try {
      await this.getTransporter().verify();
      return 'operational';
    } catch {
      return 'unreachable';
    }
  }

  protected operationHandlers() {
    return {
      send: (args: Record<string, unknown>) => this.send(args),
    };
  }

  private getTransporter(): nodemailer.Transporter {
    if (this.transporter) return this.transporter;
    const c = this.smtpConfig;
    this.transporter = nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.secure ?? false, // false = STARTTLS en 587 (nodemailer negocia solo)
      auth: { user: c.user, pass: c.pass },
    });
    return this.transporter;
  }

  private parseAttachments(args: Record<string, unknown>): nodemailer.SendMailOptions['attachments'] {
    const raw = args.attachments;
    if (!Array.isArray(raw)) return undefined;
    return raw
      .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
      .map((a) => {
        // El contenido llega en dos formas según el origen: base64 string
        // (envío legado, con `encoding:'base64'` explícito) o Buffer real
        // (documentos resueltos por el DocumentFlowEngine). Forzar
        // `String(buffer)` aquí decodificaría los bytes binarios como UTF-8
        // y corrompería el PDF — hay que pasar el Buffer tal cual.
        const content = Buffer.isBuffer(a.content) ? a.content : String(a.content ?? '');
        return {
          filename: String(a.filename ?? 'adjunto'),
          content,
          encoding: a.encoding ? (String(a.encoding) as 'base64') : undefined,
          contentType: a.contentType
            ? String(a.contentType)
            : a.mimeType
              ? String(a.mimeType)
              : undefined,
        };
      })
      .filter((a) => a.content.length > 0);
  }

  private async send(args: Record<string, unknown>): Promise<{ id: string; delivered: boolean }> {
    if (!this.isConfigured()) {
      throw new Error(
        'pending_credentials: faltan host/port/user/pass/fromAddress en la configuración SMTP del tenant',
      );
    }
    const to = String(args.to ?? '');
    const subject = String(args.subject ?? '');
    const body = String(args.body ?? '');
    if (!to) throw new Error('BUSINESS_ERROR: to requerido');
    if (!subject) throw new Error('BUSINESS_ERROR: subject requerido');

    const info = await this.getTransporter().sendMail({
      from: this.smtpConfig.fromAddress,
      to,
      subject,
      html: body,
      attachments: this.parseAttachments(args),
    });
    return { id: info.messageId, delivered: true };
  }
}
