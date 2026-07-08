import { generateKeyPairSync } from 'crypto';
import {
  LicenseSigningService,
  LicenseClaims,
} from './license-signing.service';

function makeService(env: Record<string, string | undefined> = {}) {
  const config = { get: jest.fn((key: string) => env[key]) };
  const svc = new LicenseSigningService(config as never);
  svc.onModuleInit();
  return svc;
}

function claims(overrides: Partial<LicenseClaims> = {}): LicenseClaims {
  return {
    licenseId: 'lic-1',
    tenantId: 't1',
    installationId: 'inst-1',
    planKey: 'starter',
    status: 'active',
    maxUsers: 10,
    maxSites: 1,
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-02-01T00:00:00.000Z',
    gracePeriodDays: 7,
    offline: false,
    ...overrides,
  };
}

describe('LicenseSigningService', () => {
  it('firma y verifica correctamente los mismos claims (dev efímero)', () => {
    const svc = makeService();
    const c = claims();
    const { signature } = svc.sign(c);
    expect(svc.verify(c, signature)).toBe(true);
  });

  it('detecta manipulación: cualquier cambio en los claims invalida la firma', () => {
    const svc = makeService();
    const c = claims();
    const { signature } = svc.sign(c);

    const tampered = claims({ expiresAt: '2099-01-01T00:00:00.000Z' });
    expect(svc.verify(tampered, signature)).toBe(false);
  });

  it('detecta manipulación en maxUsers (escalada de licencia)', () => {
    const svc = makeService();
    const c = claims({ maxUsers: 10 });
    const { signature } = svc.sign(c);

    const tampered = claims({ maxUsers: 99999 });
    expect(svc.verify(tampered, signature)).toBe(false);
  });

  it('firma inválida o corrupta nunca verifica', () => {
    const svc = makeService();
    const c = claims();
    expect(svc.verify(c, 'no-es-base64-valido-firma-falsa')).toBe(false);
  });

  it('una firma generada por OTRO par de claves no valida contra este servicio', () => {
    const svc1 = makeService();
    const svc2 = makeService();
    const c = claims();
    const { signature } = svc1.sign(c);
    // Cada instancia efímera de dev genera su propio par de claves.
    expect(svc2.verify(c, signature)).toBe(false);
  });

  it('carga claves reales desde configuración (base64 PEM) y dos instancias con las mismas claves interoperan', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const env = {
      LICENSE_SIGNING_PRIVATE_KEY: Buffer.from(
        privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      ).toString('base64'),
      LICENSE_SIGNING_PUBLIC_KEY: Buffer.from(
        publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      ).toString('base64'),
      LICENSE_SIGNING_KEY_ID: 'test-key-1',
    };

    const issuer = makeService(env);
    const verifier = makeService(env);
    const c = claims();
    const { signature, keyId } = issuer.sign(c);

    expect(keyId).toBe('test-key-1');
    expect(verifier.verify(c, signature)).toBe(true);
  });

  it('en NODE_ENV=production, sin claves configuradas debe fallar al iniciar', () => {
    expect(() => makeService({ NODE_ENV: 'production' })).toThrow(
      /LICENSE_SIGNING_PRIVATE_KEY/,
    );
  });
});
