import { IdempotencyService } from './idempotency.service';
import { IdempotencyStatus } from '../../entities/idempotency-record.entity';

function makeService() {
  const rows = new Map<string, { tenantId: string; key: string; status: IdempotencyStatus; result?: unknown; expiresAt: Date }>();
  const repo = {
    createQueryBuilder: jest.fn().mockReturnValue({
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn(function (this: unknown, v: { tenantId: string; key: string; status: IdempotencyStatus; expiresAt: Date }) {
        (this as { _v: unknown })._v = v;
        return this;
      }),
      orIgnore: jest.fn().mockReturnThis(),
      // Refleja el comportamiento real de Postgres/TypeORM con
      // `ON CONFLICT DO NOTHING`: `identifiers` SIEMPRE trae una entrada
      // (null si se descartó) — el campo que de verdad queda vacío en un
      // conflicto es `raw`. El servicio debe mirar `raw`, no `identifiers`.
      execute: jest.fn(async function (this: { _v: { tenantId: string; key: string; status: IdempotencyStatus; expiresAt: Date } }) {
        const v = this._v;
        const rowKey = `${v.tenantId}:${v.key}`;
        if (rows.has(rowKey)) return { identifiers: [null], raw: [] };
        rows.set(rowKey, { ...v });
        return { identifiers: [{ id: 'x' }], raw: [{ id: 'x' }] };
      }),
    }),
    findOne: jest.fn(async ({ where }: { where: { tenantId: string; key: string } }) => {
      const row = rows.get(`${where.tenantId}:${where.key}`);
      return row ? { ...row } : null;
    }),
    update: jest.fn(async ({ tenantId, key }: { tenantId: string; key: string }, patch: Partial<{ status: IdempotencyStatus; result: unknown; error: string }>) => {
      const rowKey = `${tenantId}:${key}`;
      const row = rows.get(rowKey);
      if (row) Object.assign(row, patch);
    }),
    delete: jest.fn(async ({ tenantId, key, expiresAt }: { tenantId: string; key: string; expiresAt: { _type?: string; _value?: Date } }) => {
      const rowKey = `${tenantId}:${key}`;
      const row = rows.get(rowKey);
      // El fake no interpreta LessThan de verdad; para el spec de expiración se borra a mano.
      void expiresAt;
      if (row && row.expiresAt.getTime() < Date.now()) rows.delete(rowKey);
    }),
  };
  const service = new IdempotencyService(repo as never);
  return { service, rows };
}

describe('IdempotencyService.computeKey', () => {
  const service = new IdempotencyService({} as never);

  it('usa el Message-ID cuando existe, con prioridad sobre todo lo demás', () => {
    const key = service.computeKey({
      messageId: '<abc123@mail.oben.com>',
      from: 'a@b.com',
      subject: 'X',
      body: 'Y',
    });
    expect(key).toBe('mid:<abc123@mail.oben.com>');
  });

  it('sin Message-ID → hash sha256 determinístico de remitente+asunto+cuerpo normalizado+adjuntos', () => {
    const k1 = service.computeKey({ from: 'A@B.com', subject: ' Hola ', body: 'línea uno\n\nlínea dos', attachmentNames: ['PO.pdf'] });
    const k2 = service.computeKey({ from: 'a@b.com', subject: 'hola', body: 'línea uno línea dos', attachmentNames: ['po.pdf'] });
    expect(k1).toBe(k2); // normalización hace que ambas formas produzcan la misma clave
    expect(k1).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('cuerpos distintos producen claves distintas (no hay colisión trivial)', () => {
    const k1 = service.computeKey({ from: 'a@b.com', subject: 's', body: 'contenido A' });
    const k2 = service.computeKey({ from: 'a@b.com', subject: 's', body: 'contenido B' });
    expect(k1).not.toBe(k2);
  });
});

describe('IdempotencyService.claim / markCompleted / markFailed', () => {
  it('primera reclamación de una clave → claimed=true', async () => {
    const { service } = makeService();
    const result = await service.claim('t1', 'quote_email', 'sha256:aaa', 60_000);
    expect(result.claimed).toBe(true);
  });

  it('segunda reclamación de la MISMA clave mientras está processing → claimed=false, existingStatus=processing', async () => {
    const { service } = makeService();
    await service.claim('t1', 'quote_email', 'sha256:aaa', 60_000);
    const second = await service.claim('t1', 'quote_email', 'sha256:aaa', 60_000);
    expect(second.claimed).toBe(false);
    expect(second.existingStatus).toBe(IdempotencyStatus.PROCESSING);
  });

  it('tras markCompleted, una nueva reclamación de la misma clave devuelve el resultado guardado', async () => {
    const { service } = makeService();
    await service.claim('t1', 'quote_email', 'sha256:aaa', 60_000);
    await service.markCompleted('t1', 'sha256:aaa', { quoteId: 'q1' });
    const again = await service.claim('t1', 'quote_email', 'sha256:aaa', 60_000);
    expect(again.claimed).toBe(false);
    expect(again.existingStatus).toBe(IdempotencyStatus.COMPLETED);
    expect(again.existingResult).toEqual({ quoteId: 'q1' });
  });

  it('tenants distintos con la MISMA clave no se bloquean entre sí', async () => {
    const { service } = makeService();
    const a = await service.claim('t1', 'quote_email', 'sha256:aaa', 60_000);
    const b = await service.claim('t2', 'quote_email', 'sha256:aaa', 60_000);
    expect(a.claimed).toBe(true);
    expect(b.claimed).toBe(true);
  });
});
