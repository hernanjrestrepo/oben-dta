import { of, throwError, firstValueFrom } from 'rxjs';
import { ConflictException, CallHandler, ExecutionContext } from '@nestjs/common';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyStatus } from '../../entities/idempotency-record.entity';
import { IDEMPOTENT_EVENT_KEY, IDEMPOTENT_TTL_KEY } from './idempotent.decorator';

function makeContext(body: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ body }) }),
    getHandler: () => ({}),
  } as unknown as ExecutionContext;
}

function makeHandler(result: unknown, shouldThrow = false): { handler: CallHandler; callCount: () => number } {
  let calls = 0;
  const handler: CallHandler = {
    handle: () => {
      calls += 1;
      return shouldThrow ? throwError(() => new Error('boom')) : of(result);
    },
  };
  return { handler, callCount: () => calls };
}

function makeInterceptor(eventType: string | undefined) {
  const reflector = { get: jest.fn((key: string) => (key === IDEMPOTENT_EVENT_KEY ? eventType : 24 * 60 * 60 * 1000)) };
  const claim = jest.fn();
  const markCompleted = jest.fn().mockResolvedValue(undefined);
  const markFailed = jest.fn().mockResolvedValue(undefined);
  const idempotency = {
    computeKey: jest.fn().mockReturnValue('sha256:fixedkey'),
    claim,
    markCompleted,
    markFailed,
  };
  const ctx = { tenantId: 't1' };
  const interceptor = new IdempotencyInterceptor(reflector as never, idempotency as never, ctx as never);
  return { interceptor, claim, markCompleted, markFailed };
}

describe('IdempotencyInterceptor', () => {
  it('sin @Idempotent en el handler → deja pasar sin tocar nada', async () => {
    const { interceptor, claim } = makeInterceptor(undefined);
    const { handler, callCount } = makeHandler({ ok: true });
    const result$ = interceptor.intercept(makeContext({ from: 'a@b.com', subject: 's', body: 'b' }), handler);
    const result = await firstValueFrom(result$ as never);
    expect(result).toEqual({ ok: true });
    expect(callCount()).toBe(1);
    expect(claim).not.toHaveBeenCalled();
  });

  it('primera vez (claim ganado) → ejecuta el controlador UNA vez y marca completed', async () => {
    const { interceptor, claim, markCompleted } = makeInterceptor('quote_email');
    claim.mockResolvedValue({ claimed: true });
    const { handler, callCount } = makeHandler({ quoteId: 'q1' });

    const result = await firstValueFrom(
      interceptor.intercept(makeContext({ from: 'a@b.com', subject: 's', body: 'b' }), handler) as never,
    );

    expect(result).toEqual({ quoteId: 'q1' });
    expect(callCount()).toBe(1);
    expect(markCompleted).toHaveBeenCalledWith('t1', 'sha256:fixedkey', { quoteId: 'q1' });
  });

  it('correo repetido ya completado → devuelve el resultado guardado SIN ejecutar el controlador', async () => {
    const { interceptor, claim } = makeInterceptor('quote_email');
    claim.mockResolvedValue({ claimed: false, existingStatus: IdempotencyStatus.COMPLETED, existingResult: { quoteId: 'q1' } });
    const { handler, callCount } = makeHandler({ quoteId: 'DEBERIA_NO_LLEGAR' });

    const result = await firstValueFrom(
      interceptor.intercept(makeContext({ from: 'a@b.com', subject: 's', body: 'b' }), handler) as never,
    );

    expect(result).toEqual({ quoteId: 'q1' });
    expect(callCount()).toBe(0); // el controlador NUNCA se ejecutó la segunda vez
  });

  it('duplicado concurrente (todavía processing) → 409, controlador no se ejecuta', async () => {
    const { interceptor, claim } = makeInterceptor('quote_email');
    claim.mockResolvedValue({ claimed: false, existingStatus: IdempotencyStatus.PROCESSING });
    const { handler, callCount } = makeHandler({ quoteId: 'x' });

    await expect(
      firstValueFrom(interceptor.intercept(makeContext({ from: 'a@b.com', subject: 's', body: 'b' }), handler) as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(callCount()).toBe(0);
  });

  it('el controlador falla → marca failed y propaga el error', async () => {
    const { interceptor, claim, markFailed } = makeInterceptor('quote_email');
    claim.mockResolvedValue({ claimed: true });
    const { handler } = makeHandler(null, true);

    await expect(
      firstValueFrom(interceptor.intercept(makeContext({ from: 'a@b.com', subject: 's', body: 'b' }), handler) as never),
    ).rejects.toThrow('boom');
    expect(markFailed).toHaveBeenCalledWith('t1', 'sha256:fixedkey', 'boom');
  });
});
