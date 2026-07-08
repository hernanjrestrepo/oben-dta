import { applyScenario, NotFoundSignal } from './scenario-runtime';

describe('applyScenario', () => {
  it('happy_path no lanza', async () => {
    await expect(
      applyScenario({ behavior: 'happy_path' }),
    ).resolves.toBeUndefined();
  });

  it('auth_error lanza con mensaje explicativo', async () => {
    await expect(applyScenario({ behavior: 'auth_error' })).rejects.toThrow(
      /auth_error/,
    );
  });

  it('business_error incluye errorCode + errorMessage', async () => {
    await expect(
      applyScenario({
        behavior: 'business_error',
        errorCode: 'CREDIT_INSUFFICIENT',
        errorMessage: 'cupo excedido',
      }),
    ).rejects.toThrow(/CREDIT_INSUFFICIENT.*cupo excedido/);
  });

  it('errorRatio con rng<ratio dispara, con rng>=ratio no dispara', async () => {
    const alwaysFire = () => 0;
    await expect(
      applyScenario({ behavior: 'network_error', errorRatio: 0.5 }, alwaysFire),
    ).rejects.toThrow(/network_error/);

    const neverFire = () => 0.9;
    await expect(
      applyScenario({ behavior: 'network_error', errorRatio: 0.5 }, neverFire),
    ).resolves.toBeUndefined();
  });

  it('not_found lanza NotFoundSignal', async () => {
    try {
      await applyScenario({ behavior: 'not_found' });
      fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundSignal);
    }
  });
});
