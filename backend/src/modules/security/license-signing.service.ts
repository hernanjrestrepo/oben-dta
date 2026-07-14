import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  KeyObject,
} from 'crypto';

export interface LicenseClaims {
  licenseId: string;
  tenantId: string;
  installationId: string;
  // Opcional (no `| null`): las licencias emitidas antes de este control se
  // firmaron sin esta clave en el JSON canónico. Si se agregara siempre —
  // aunque fuera null — la firma de TODAS las licencias ya emitidas dejaría
  // de verificar el día del despliegue, sin que nadie las haya manipulado.
  // Se omite del objeto por completo cuando no aplica (ver toClaims()).
  installationFingerprint?: string;
  planKey: string;
  status: string;
  maxUsers: number;
  maxSites: number;
  issuedAt: string;
  expiresAt: string;
  gracePeriodDays: number;
  offline: boolean;
}

/**
 * Firma y verifica licencias con Ed25519 (asimétrico). La clave privada solo
 * existe en el emisor (Paradixe); la clave pública puede distribuirse para
 * verificación offline sin exponer la capacidad de firmar. Esto es lo que
 * hace inútil clonar o editar manualmente una fila de `licenses`: cualquier
 * cambio en los claims invalida la firma porque nadie fuera del emisor puede
 * producir una firma válida para el nuevo contenido.
 *
 * Claves: LICENSE_SIGNING_PRIVATE_KEY / LICENSE_SIGNING_PUBLIC_KEY (PEM en
 * base64 para sobrevivir a un .env de una sola línea). Si faltan (solo dev/test,
 * nunca producción) se genera un par efímero en memoria con warning explícito —
 * las licencias firmadas con esa clave dejan de validar en el próximo reinicio,
 * lo cual es intencional: fuerza a configurar claves reales antes de operar.
 */
@Injectable()
export class LicenseSigningService implements OnModuleInit {
  private readonly logger = new Logger(LicenseSigningService.name);
  private privateKey: KeyObject;
  private publicKey: KeyObject;
  keyId: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const privB64 = this.config.get<string>('LICENSE_SIGNING_PRIVATE_KEY');
    const pubB64 = this.config.get<string>('LICENSE_SIGNING_PUBLIC_KEY');
    this.keyId = this.config.get<string>('LICENSE_SIGNING_KEY_ID') || 'default';

    if (privB64 && pubB64) {
      this.privateKey = createPrivateKey(
        Buffer.from(privB64, 'base64').toString('utf-8'),
      );
      this.publicKey = createPublicKey(
        Buffer.from(pubB64, 'base64').toString('utf-8'),
      );
      this.logger.log(
        `Claves de firma de licencia cargadas (keyId=${this.keyId})`,
      );
      return;
    }

    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new Error(
        'LICENSE_SIGNING_PRIVATE_KEY / LICENSE_SIGNING_PUBLIC_KEY son obligatorias en producción. ' +
          'Generar con: npm run license:generate-keys',
      );
    }

    this.logger.warn(
      'LICENSE_SIGNING_PRIVATE_KEY/PUBLIC_KEY no configuradas — generando par Ed25519 efímero ' +
        'SOLO para desarrollo. Las licencias firmadas no sobrevivirán un reinicio.',
    );
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    this.privateKey = privateKey;
    this.publicKey = publicKey;
    this.keyId = 'ephemeral-dev';
  }

  private canonicalize(claims: LicenseClaims): Buffer {
    const ordered = Object.keys(claims)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = (claims as unknown as Record<string, unknown>)[key];
        return acc;
      }, {});
    return Buffer.from(JSON.stringify(ordered), 'utf-8');
  }

  sign(claims: LicenseClaims): { signature: string; keyId: string } {
    const data = this.canonicalize(claims);
    const signature = cryptoSign(null, data, this.privateKey).toString(
      'base64',
    );
    return { signature, keyId: this.keyId };
  }

  verify(claims: LicenseClaims, signature: string): boolean {
    try {
      const data = this.canonicalize(claims);
      return cryptoVerify(
        null,
        data,
        this.publicKey,
        Buffer.from(signature, 'base64'),
      );
    } catch {
      return false;
    }
  }
}
