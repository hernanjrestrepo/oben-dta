import { QuotesService } from './quotes.service';
import { QuoteStatus } from '../../entities/quote.entity';

function makeQuote() {
  return {
    id: 'q1',
    quoteNumber: 'COT-1',
    status: QuoteStatus.QUOTED,
    total: 100,
    pdfUrl: null as string | null,
    client: { id: 'c1', email: 'cliente@test.com', name: 'Cliente Test' },
    items: [],
  } as unknown as import('../../entities/quote.entity').Quote;
}

function makeService(opts: {
  documentFlowEnabled: boolean;
  engineResult?: unknown;
}) {
  const quote = makeQuote();
  const quoteRepository = {
    findOne: jest.fn().mockResolvedValue(quote),
    save: jest.fn().mockImplementation((q) => Promise.resolve(q)),
    create: jest.fn(),
  };
  const clientRepository = { findOne: jest.fn(), save: jest.fn() };
  const productRepository = { find: jest.fn(), decrement: jest.fn() };
  const tenantRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: 't1',
      settings: {
        documentFlowEngine: { quotes: opts.documentFlowEnabled },
      },
    }),
  };
  const emailService = { receiveEmail: jest.fn() };
  const pdfService = {
    generateQuotePdf: jest.fn().mockResolvedValue(Buffer.from('legacy-pdf')),
  };
  const paymentService = {};
  const ctx = { tenantId: 't1', userId: 'u1' };
  const hub = { call: jest.fn().mockResolvedValue({ ok: true, data: { id: 'm1' } }) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const orders = {};
  const invoices = {};
  const documentFlowEngine = {
    handle: jest.fn().mockResolvedValue(
      opts.engineResult ?? {
        event: 'QUOTE_REQUESTED',
        rules: [
          {
            ruleId: 'r1',
            ruleName: 'Cotización → cliente',
            status: 'completed',
            missingRequired: [],
            documents: [
              {
                key: 'quote_pdf',
                state: 'ready',
                filename: 'COT-1.pdf',
                mimeType: 'application/pdf',
                content: Buffer.from('engine-pdf'),
              },
            ],
            actions: [{ type: 'send_email', status: 'executed' }],
          },
        ],
      },
    ),
  };

  const service = new QuotesService(
    quoteRepository as never,
    clientRepository as never,
    productRepository as never,
    tenantRepository as never,
    emailService as never,
    pdfService as never,
    paymentService as never,
    ctx as never,
    hub as never,
    audit as never,
    orders as never,
    invoices as never,
    documentFlowEngine as never,
  );

  return { service, quote, hub, audit, documentFlowEngine, pdfService };
}

describe('QuotesService.generateAndSendPdf — migración a DocumentFlowEngine', () => {
  it('flag OFF (default) → usa el camino legado: hub.call directo, sin tocar el motor', async () => {
    const { service, hub, audit, documentFlowEngine, pdfService } = makeService({
      documentFlowEnabled: false,
    });
    const result = await service.generateAndSendPdf('q1');

    expect(pdfService.generateQuotePdf).toHaveBeenCalledTimes(1);
    expect(hub.call).toHaveBeenCalledWith(
      'email',
      'send',
      expect.objectContaining({ to: 'cliente@test.com' }),
      { maxAttempts: 1, timeoutMs: 30_000 },
    );
    expect(documentFlowEngine.handle).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'pdf_generated' }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'email_sent' }),
    );
    expect(result.status).toBe(QuoteStatus.SENT);
    expect(result.pdfUrl).toContain('base64');
  });

  it('flag ON → delega en DocumentFlowEngine.handle("QUOTE_REQUESTED", ...) y usa su resultado', async () => {
    const { service, hub, documentFlowEngine } = makeService({
      documentFlowEnabled: true,
    });
    const result = await service.generateAndSendPdf('q1');

    expect(documentFlowEngine.handle).toHaveBeenCalledWith(
      'QUOTE_REQUESTED',
      expect.objectContaining({
        tenantId: 't1',
        client: expect.objectContaining({ email: 'cliente@test.com' }),
        quote: expect.objectContaining({ id: 'q1', quoteNumber: 'COT-1' }),
        metadata: expect.objectContaining({
          emailSubject: expect.any(String),
          emailBody: expect.any(String),
        }),
      }),
    );
    // El envío real ahora ocurre DENTRO del motor (SendEmailAction), no aquí.
    expect(hub.call).not.toHaveBeenCalled();
    expect(result.status).toBe(QuoteStatus.SENT);
    expect(result.pdfUrl).toContain(
      Buffer.from('engine-pdf').toString('base64'),
    );
  });

  it('flag ON pero sin DocumentFlowRule activa → falla explícitamente, no degrada en silencio', async () => {
    const { service } = makeService({
      documentFlowEnabled: true,
      engineResult: { event: 'QUOTE_REQUESTED', rules: [] },
    });
    await expect(service.generateAndSendPdf('q1')).rejects.toThrow(
      /no hay DocumentFlowRule activa/,
    );
  });

  it('flag ON pero la regla queda "partial" (documento faltante) → falla explícitamente', async () => {
    const { service } = makeService({
      documentFlowEnabled: true,
      engineResult: {
        event: 'QUOTE_REQUESTED',
        rules: [
          {
            ruleId: 'r1',
            ruleName: 'x',
            status: 'partial',
            missingRequired: ['quote_pdf'],
            documents: [],
            actions: [],
          },
        ],
      },
    });
    await expect(service.generateAndSendPdf('q1')).rejects.toThrow(/no se completó/);
  });
});
