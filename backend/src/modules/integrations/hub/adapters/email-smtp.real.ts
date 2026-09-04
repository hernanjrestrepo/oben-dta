import { Injectable, Optional } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { BaseAdapter } from '../base-adapter';
import {
  AdapterCapability,
  AdapterCallContext,
  AdapterMode,
  AdapterState,
  BaseAdapterConfig,
} from '../adapter.types';
import {
  MicrosoftAppTokenService,
  readMicrosoftAppCredentialsFromEnv,
} from '../../../../common/microsoft-oauth/microsoft-app-token.service';

export interface EmailSmtpAdapterConfig extends BaseAdapterConfig {
  host?: string;
  port?: number;
  /** STARTTLS (587) vs TLS implícito (465). false = STARTTLS. */
  secure?: boolean;
  user?: string;
  pass?: string;
  fromAddress?: string;
  /**
   * 'oauth2': usa MS_MAIL_OAUTH_CLIENT_ID/SECRET/TENANT_ID (variables de
   * entorno, nunca en la config del tenant) para autenticar vía Microsoft
   * identity platform en vez de usuario/contraseña — Microsoft viene
   * deprecando basic auth en Exchange Online. `pass` no se usa en este modo.
   */
  authType?: 'basic' | 'oauth2';
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

  constructor(
    private readonly smtpConfig: EmailSmtpAdapterConfig,
    @Optional() private readonly msToken?: MicrosoftAppTokenService,
  ) {
    super(smtpConfig);
  }

  capabilities(): AdapterCapability[] {
    return [{ operation: 'send', method: 'write', description: 'Enviar email vía SMTP real' }];
  }

  private isConfigured(): boolean {
    const c = this.smtpConfig;
    if (c.authType === 'oauth2') {
      return !!(c.host && c.port && c.user && c.fromAddress);
    }
    return !!(c.host && c.port && c.user && c.pass && c.fromAddress);
  }

  protected async checkHealth(): Promise<AdapterState> {
    if (!this.isConfigured()) return 'pending_credentials';
    try {
      const transporter = await this.getTransporter();
      await transporter.verify();
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

  private async getTransporter(): Promise<nodemailer.Transporter> {
    const c = this.smtpConfig;
    if (c.authType === 'oauth2') {
      // No se cachea: el access token expira (~1h) y el volumen de correo es
      // bajo (piloto: hasta ~100/día) — pedir uno fresco por conexión es más
      // simple y correcto que gestionar la expiración de un transporter cacheado.
      const accessToken = await this.getOAuth2AccessToken();
      return nodemailer.createTransport({
        host: c.host,
        port: c.port,
        secure: c.secure ?? false,
        auth: { type: 'OAuth2', user: c.user, accessToken },
      });
    }
    if (this.transporter) return this.transporter;
    this.transporter = nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.secure ?? false, // false = STARTTLS en 587 (nodemailer negocia solo)
      auth: { user: c.user, pass: c.pass },
    });
    return this.transporter;
  }

  private async getOAuth2AccessToken(): Promise<string> {
    const creds = readMicrosoftAppCredentialsFromEnv();
    if (!creds) {
      throw new Error(
        'pending_credentials: authType=oauth2 pero faltan MS_MAIL_OAUTH_CLIENT_ID/SECRET/TENANT_ID en el entorno',
      );
    }
    if (!this.msToken) {
      throw new Error('pending_credentials: MicrosoftAppTokenService no disponible para OAuth2');
    }
    return this.msToken.getAccessToken(creds);
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
      const missing = this.smtpConfig.authType === 'oauth2' ? 'host/port/user/fromAddress' : 'host/port/user/pass/fromAddress';
      throw new Error(`pending_credentials: faltan ${missing} en la configuración SMTP del tenant`);
    }
    const to = String(args.to ?? '');
    const subject = String(args.subject ?? '');
    const body = String(args.body ?? '');
    if (!to) throw new Error('BUSINESS_ERROR: to requerido');
    if (!subject) throw new Error('BUSINESS_ERROR: subject requerido');

    const cc = this.parseAddressList(args.cc);
    const bcc = this.parseAddressList(args.bcc);

    const transporter = await this.getTransporter();
    const info = await transporter.sendMail({
      from: this.smtpConfig.fromAddress,
      to,
      ...(cc ? { cc } : {}),
      ...(bcc ? { bcc } : {}),
      subject,
      html: body,
      attachments: this.parseAttachments(args),
    });
    return { id: info.messageId, delivered: true };
  }

  /** Acepta string único, string separado por comas, o array de strings. */
  private parseAddressList(value: unknown): string | undefined {
    if (!value) return undefined;
    if (Array.isArray(value)) {
      const joined = value.map((v) => String(v).trim()).filter(Boolean).join(',');
      return joined || undefined;
    }
    const str = String(value).trim();
    return str || undefined;
  }
}
