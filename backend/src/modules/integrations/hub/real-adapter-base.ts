import { BaseAdapter } from './base-adapter';
import { AdapterMode, AdapterState } from './adapter.types';

/**
 * Bloquea por defecto los destinos de red privada/interna (RC1 Sprint 5 —
 * SSRF confirmado y corregido: con `platform.tenants.manage` se podía
 * apuntar `baseUrl` a un hostname interno de la red docker, y
 * `integrations.read` bastaba para dispararlo repetidamente y llegó a
 * responder con datos internos reales).
 *
 * Denegar-por-defecto es la postura correcta: si el Oracle/ERP real de Oben
 * vive en una IP privada alcanzable solo desde el servidor, activar ESE caso
 * puntual es una decisión explícita de despliegue (documentada como riesgo
 * abierto en SECURITY_REVIEW_RC1.md) — no algo que deba quedar abierto para
 * cualquier baseUrl por default.
 *
 * Limitación conocida (documentada, no resuelta en RC1): esta validación es
 * textual sobre IPs literales en el hostname — no resuelve DNS antes de
 * conectar. Un hostname (ej. un alias interno de red que no sea una IP
 * literal) que resuelva a una IP privada en el momento de la conexión
 * (DNS rebinding) NO queda cubierto por este chequeo. Cubrirlo requeriría
 * resolver el DNS y validar la IP resuelta antes de conectar.
 */
function assertSafeUrl(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`ssrf_blocked: baseUrl inválida: ${rawUrl}`);
  }
  const host = url.hostname.toLowerCase();

  if (host === 'localhost' || host === '::1') {
    throw new Error(`ssrf_blocked: destino no permitido para integraciones externas: ${host}`);
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    const isLoopback = a === 127;
    const isLinkLocalOrMetadata = a === 169 && b === 254; // AWS/Azure/GCP metadata + link-local
    const isPrivateA = a === 10;
    const isPrivateB = a === 172 && b >= 16 && b <= 31;
    const isPrivateC = a === 192 && b === 168;
    const isUnspecified = a === 0;
    if (isLoopback || isLinkLocalOrMetadata || isPrivateA || isPrivateB || isPrivateC || isUnspecified) {
      throw new Error(`ssrf_blocked: destino no permitido para integraciones externas: ${host}`);
    }
  }
}

/**
 * Base para adapters en modo `real`. Provee:
 *  - assertConfigured() para lanzar `pending_credentials` si falta cualquier
 *    campo esencial de la configuración del tenant.
 *  - Contrato para el HTTP fetch con timeout uniforme.
 *
 * Cada adapter real concreto declara qué campos son requeridos y qué endpoints
 * usa. La configuración se pasa por constructor desde AdapterFactory.
 */
export abstract class RealAdapterBase extends BaseAdapter {
  readonly mode: AdapterMode = 'real';

  protected abstract requiredConfigFields(): string[];

  protected async checkHealth(): Promise<AdapterState> {
    return this.isConfigured() ? 'operational' : 'pending_credentials';
  }

  isConfigured(): boolean {
    const cfg = this.config as unknown as Record<string, unknown>;
    for (const key of this.requiredConfigFields()) {
      const value = cfg[key];
      if (value === undefined || value === null || value === '') return false;
    }
    return true;
  }

  protected assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error(
        'pending_credentials: faltan credenciales o base URL en la configuración del tenant',
      );
    }
  }

  protected async httpJson<T>(
    input: string,
    init: RequestInit = {},
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    this.assertConfigured();
    assertSafeUrl(input);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 15000,
    );
    try {
      const res = await fetch(input, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...extraHeaders,
          ...(init.headers as Record<string, string>),
        },
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 240)}`);
      }
      return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
    } finally {
      clearTimeout(timeout);
    }
  }
}
