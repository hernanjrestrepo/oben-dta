import { SendEmailAction } from './send-email.action';

function makeAction() {
  const adapterExecute = jest.fn().mockResolvedValue({ ok: true, data: { id: 'm1' } });
  const adapter = { execute: adapterExecute };
  const adapters = { resolve: jest.fn().mockResolvedValue(adapter) };
  // Delega al adapter directamente — el comportamiento de retry/circuit breaker
  // en sí tiene su propio spec (resilient-adapter-executor.spec.ts).
  const resilientExecute = jest
    .fn()
    .mockImplementation((a, operation, args, ctx) => a.execute(operation, args, ctx));
  const resilientExecutor = { execute: resilientExecute };
  const action = new SendEmailAction(adapters as never, resilientExecutor as never);
  return { action, adapters, adapterExecute, resilientExecute };
}

describe('SendEmailAction', () => {
  it('interpola destinatarios con {{path}} contra el context', async () => {
    const { action, adapters, adapterExecute } = makeAction();
    await action.execute({
      action: { type: 'send_email', config: {} },
      context: {
        tenantId: 't1',
        client: { id: 'c1', email: 'cliente@test.com' },
      },
      documents: [],
      recipients: [{ label: 'Cliente', to: ['{{client.email}}'] }],
    });
    expect(adapters.resolve).toHaveBeenCalledWith('t1', 'email');
    expect(adapterExecute).toHaveBeenCalledWith(
      'send',
      expect.objectContaining({ to: 'cliente@test.com' }),
      expect.objectContaining({ tenantId: 't1' }),
    );
  });

  it('usa metadata.emailSubject/emailBody cuando vienen precalculados, sin tocar los templates', async () => {
    const { action, adapterExecute } = makeAction();
    await action.execute({
      action: {
        type: 'send_email',
        config: { subjectTemplate: 'NO debería usarse' },
      },
      context: {
        tenantId: 't1',
        metadata: { emailSubject: 'Asunto real', emailBody: '<p>Cuerpo real</p>' },
      },
      documents: [],
      recipients: [{ label: 'Cliente', to: ['fijo@test.com'] }],
    });
    expect(adapterExecute).toHaveBeenCalledWith(
      'send',
      expect.objectContaining({ subject: 'Asunto real', body: '<p>Cuerpo real</p>' }),
      expect.anything(),
    );
  });

  it('sin destinatarios (recipient vacío tras interpolar) → skipped, no llama al adapter', async () => {
    const { action, adapters } = makeAction();
    const result = await action.execute({
      action: { type: 'send_email', config: {} },
      context: { tenantId: 't1' },
      documents: [],
      recipients: [{ label: 'Cliente', to: ['{{client.email}}'] }],
    });
    expect(result.status).toBe('skipped');
    expect(adapters.resolve).not.toHaveBeenCalled();
  });

  it('resultado no-ok del adapter → status failed con el mensaje de error', async () => {
    const { action, resilientExecute } = makeAction();
    resilientExecute.mockResolvedValueOnce({ ok: false, error: 'circuit_open: ...' });
    const result = await action.execute({
      action: { type: 'send_email', config: {} },
      context: { tenantId: 't1' },
      documents: [],
      recipients: [{ label: 'Cliente', to: ['fijo@test.com'] }],
    });
    expect(result.status).toBe('failed');
    expect(result.message).toMatch(/circuit_open/);
  });
});
