import { Injectable, Logger } from '@nestjs/common';

export interface MicrosoftAppCredentials {
  clientId: string;
  clientSecret: string;
  azureTenantId: string;
  /** Scope OAuth2 (client_credentials). IMAP/SMTP de Exchange Online usa este. */
  scope?: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

/**
 * Obtiene y cachea un token app-only (client_credentials) contra Microsoft
 * identity platform para IMAP/SMTP OAuth2 de Exchange Online — reemplaza el
 * basic auth (user/pass) que Microsoft viene deprecando en 365. Las
 * credenciales (client id/secret/tenant id) llegan por variables de entorno
 * (MS_MAIL_OAUTH_*), nunca hardcodeadas ni en un archivo versionado —
 * mismo criterio que KIMI_API_KEY este sprint.
 */
@Injectable()
export class MicrosoftAppTokenService {
  private readonly logger = new Logger(MicrosoftAppTokenService.name);
  private cache = new Map<string, CachedToken>();

  /** 60s de margen antes del vencimiento real, para no usar un token que expira a mitad de una operación. */
  private static readonly EXPIRY_SAFETY_MARGIN_MS = 60_000;

  async getAccessToken(creds: MicrosoftAppCredentials): Promise<string> {
    const cacheKey = `${creds.azureTenantId}:${creds.clientId}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.accessToken;
    }

    const scope = creds.scope ?? 'https://outlook.office365.com/.default';
    const url = `https://login.microsoftonline.com/${creds.azureTenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      scope,
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`ms_oauth_failed: HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const json = JSON.parse(text) as { access_token: string; expires_in: number };

    const token: CachedToken = {
      accessToken: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000 - MicrosoftAppTokenService.EXPIRY_SAFETY_MARGIN_MS,
    };
    this.cache.set(cacheKey, token);
    this.logger.log(`Token OAuth2 obtenido para ${creds.clientId} (expira en ${json.expires_in}s).`);
    return token.accessToken;
  }
}

/** Lee las credenciales de app Microsoft desde variables de entorno. `null` si falta alguna. */
export function readMicrosoftAppCredentialsFromEnv(): MicrosoftAppCredentials | null {
  const clientId = process.env.MS_MAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.MS_MAIL_OAUTH_CLIENT_SECRET;
  const azureTenantId = process.env.MS_MAIL_OAUTH_TENANT_ID;
  if (!clientId || !clientSecret || !azureTenantId) return null;
  return { clientId, clientSecret, azureTenantId };
}
