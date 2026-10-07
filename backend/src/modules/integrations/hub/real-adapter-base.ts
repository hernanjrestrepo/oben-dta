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
/**
 * Excepciones EXPLÍCITAS (host:puerto exactos) a la red privada. Solo el
 * servidor de PRUEBAS del ERP de Oben (IIS, alcanzable desde nuestro servidor
 * por la VPN de Oben): ahí están los procedimientos de Liquidación y
 * Facturación (decisión de Hernán, 2026-10-01). Cualquier otro destino
 * privado sigue bloqueado.
 */
const PRIVATE_DESTINATIONS_ALLOWED = new Set(['192.168.20.12:9098', '192.168.20.12:9096']); // 9096 = API externa de factura (José, 2026-10-07)

function assertSafeUrl(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`ssrf_blocked: baseUrl inválida: ${rawUrl}`);
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    const port = url.port || (url.protocol === 'https:' ? '443' : '80');
    if (PRIVATE_DESTINATIONS_ALLOWED.has(`${host}:${port}`)) return;
  }

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
      if (!text) return undefined as unknown as T;
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Algunas transacciones reales de Oben (ej. spApproveComex_Paradixe,
        // spSettlement_Head/Detail — "Return: Varchar" en su documentación,
        // a diferencia de los "Check" que sí devuelven JSON) responden con
        // texto plano ("OK") en vez de JSON — encontrado en vivo el
        // 2026-09-11. No es un error: se devuelve el texto tal cual.
        return text as unknown as T;
      }
      // Oben NUNCA usa el status HTTP para señalar un fallo de negocio —
      // responde 200 igual, y el resultado real va en el cuerpo. Confirmado
      // en vivo el 2026-09-30 contra APICrearInvoiceParadixe (José Guzmán):
      // HTTP 200 con `{"isSuccessful":false,"Code":"500","message":"EL
      // ARTÍCULO 67511 NO SE ENCUENTRA EN LA ORDEN DE VENTA _ "}`. Sin este
      // chequeo, un rechazo real de Oben (ej. crearEncabezadoLiquidacion
      // rechazado) se leería como éxito — silenciosamente. Solo actúa si el
      // campo está PRESENTE y es `false`; una respuesta sin `isSuccessful`
      // (ej. spCheckSettlement, que no usa este sobre) sigue igual que antes.
      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        ((parsed as Record<string, unknown>).isSuccessful === false ||
          String((parsed as Record<string, unknown>).isSuccessful).toLowerCase() === 'false')
      ) {
        const body = parsed as Record<string, unknown>;
        const rawCode = body.Code ?? body.code;
        const codeValue = typeof rawCode === 'string' || typeof rawCode === 'number' ? rawCode : undefined;
        const code = codeValue !== undefined ? ` (Code ${codeValue})` : '';
        const message = typeof body.message === 'string' ? body.message : JSON.stringify(body).slice(0, 240);
        throw new Error(`Oben rechazó la operación${code}: ${message}`);
      }
      return parsed as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
