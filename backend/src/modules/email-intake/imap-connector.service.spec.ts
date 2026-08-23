import { simpleParser } from 'mailparser';
import { ImapConnectorService } from './imap-connector.service';
import { Tenant } from '../../entities/tenant.entity';
import { QuotesService } from '../quotes/quotes.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';

jest.mock('mailparser');
jest.mock('imapflow');

const TENANT_ID = 't1';

function rawEmail() {
  return Buffer.from('From: a@corp.com\r\nSubject: hola\r\n\r\nBody');
}

function makeMsg(overrides: Partial<Record<string, unknown>> = {}) {
  return { uid: 42, source: rawEmail(), ...overrides } as any;
}

describe('ImapConnectorService (WO-018 Sprint 6 — conector de correo real, entrada IMAP)', () => {
  let intakeRepo: any;
  let clientsRepo: any;
  let tenantsRepo: any;
  let classifiers: any;
  let moduleRef: any;
  let quotesService: any;
  let poService: any;
  let auditService: any;
  let tenantCtx: any;
  let service: ImapConnectorService;

  beforeEach(() => {
    jest.clearAllMocks();

    intakeRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn().mockReturnValue({
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      }),
    };
    clientsRepo = { findOne: jest.fn().mockResolvedValue(null) };
    tenantsRepo = { find: jest.fn().mockResolvedValue([]) };

    classifiers = { resolve: jest.fn() };

    quotesService = { processIncomingEmail: jest.fn().mockResolvedValue({ quote: { id: 'Q-1' }, emailId: 'E-1' }) };
    poService = { processIncomingEmail: jest.fn().mockResolvedValue({ poDocument: { id: 'PO-1' } }) };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    tenantCtx = { setContext: jest.fn() };

    moduleRef = {
      resolve: jest.fn((type: unknown) => {
        if (type === TenantContext) return Promise.resolve(tenantCtx);
        if (type === QuotesService) return Promise.resolve(quotesService);
        if (type === PurchaseOrdersService) return Promise.resolve(poService);
        if (type === WorkflowAuditService) return Promise.resolve(auditService);
        throw new Error(`tipo inesperado en test: ${String(type)}`);
      }),
    };

    service = new ImapConnectorService(
      tenantsRepo,
      clientsRepo,
      intakeRepo,
      classifiers,
      moduleRef,
    );

    (simpleParser as unknown as jest.Mock).mockResolvedValue({
      messageId: '<msg-1@corp.com>',
      from: { value: [{ address: 'cliente@corp.com' }] },
      subject: 'Solicitud',
      text: 'cuerpo',
      attachments: [],
    });
  });

  const client = () => ({
    messageFlagsAdd: jest.fn().mockResolvedValue(true),
    messageMove: jest.fn().mockResolvedValue(true),
  });

  const cfg = { host: 'imap.example.com', user: 'u', pass: 'p', enabled: true, processedFolder: 'Procesados' };

  it('enruta a QuotesService cuando el clasificador dice quote_request', async () => {
    classifiers.resolve.mockResolvedValue({
      classify: jest.fn().mockResolvedValue({ category: 'quote_request', confidence: 0.7, provider: 'rules' }),
    });
    const c = client();

    await (service as any).handleMessage(TENANT_ID, c, cfg, makeMsg());

    expect(quotesService.processIncomingEmail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'cliente@corp.com', subject: 'Solicitud', messageId: '<msg-1@corp.com>' }),
    );
    expect(poService.processIncomingEmail).not.toHaveBeenCalled();
    expect(tenantCtx.setContext).toHaveBeenCalledWith(TENANT_ID, null, false);
    expect(c.messageFlagsAdd).toHaveBeenCalledWith(String(42), ['\\Seen'], { uid: true });
    expect(c.messageMove).toHaveBeenCalledWith(String(42), 'Procesados', { uid: true });
  });

  it('enruta a PurchaseOrdersService cuando el clasificador dice purchase_order', async () => {
    classifiers.resolve.mockResolvedValue({
      classify: jest.fn().mockResolvedValue({ category: 'purchase_order', confidence: 0.9, provider: 'rules' }),
    });

    await (service as any).handleMessage(TENANT_ID, client(), cfg, makeMsg());

    expect(poService.processIncomingEmail).toHaveBeenCalled();
    expect(quotesService.processIncomingEmail).not.toHaveBeenCalled();
  });

  it.each(['carrier', 'comex', 'unknown'] as const)(
    'categoría "%s" no tiene flujo automático — queda auditada como skipped, sin llamar a Quotes/PO',
    async (category) => {
      classifiers.resolve.mockResolvedValue({
        classify: jest.fn().mockResolvedValue({ category, confidence: 0.5, provider: 'rules' }),
      });

      await (service as any).handleMessage(TENANT_ID, client(), cfg, makeMsg());

      expect(quotesService.processIncomingEmail).not.toHaveBeenCalled();
      expect(poService.processIncomingEmail).not.toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: `email_${category}_sin_flujo_automatico` }),
      );
    },
  );

  it('correo ya procesado (mismo messageId) NO se reprocesa — solo se marca \\Seen y se mueve', async () => {
    intakeRepo.findOne.mockResolvedValue({ movedToFolder: 'Procesados' });
    classifiers.resolve.mockResolvedValue({ classify: jest.fn() });
    const c = client();

    await (service as any).handleMessage(TENANT_ID, c, cfg, makeMsg());

    expect(classifiers.resolve).not.toHaveBeenCalled();
    expect(quotesService.processIncomingEmail).not.toHaveBeenCalled();
    expect(c.messageFlagsAdd).toHaveBeenCalled();
  });

  it('si el flujo destino lanza una excepción, el correo igual se marca \\Seen (no reintento infinito) y queda status=failed', async () => {
    classifiers.resolve.mockResolvedValue({
      classify: jest.fn().mockResolvedValue({ category: 'quote_request', confidence: 0.7, provider: 'rules' }),
    });
    quotesService.processIncomingEmail.mockRejectedValue(new Error('boom'));
    const c = client();
    const qb = intakeRepo.createQueryBuilder();

    await (service as any).handleMessage(TENANT_ID, c, cfg, makeMsg());

    expect(qb.values).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', errorMessage: 'boom' }),
    );
    expect(c.messageFlagsAdd).toHaveBeenCalled();
  });

  describe('readConfig — no debe autoconectar salvo configuración explícita real+enabled', () => {
    const tenant = (integrationConfig: unknown) => ({ id: TENANT_ID, integrationConfig } as Tenant);

    it('devuelve null si integrationConfig.email está vacío (default seguro)', () => {
      expect((service as any).readConfig(tenant({}))).toBeNull();
    });

    it('devuelve null si mode no es "real"', () => {
      expect(
        (service as any).readConfig(tenant({ email: { mode: 'mock', imap: { enabled: true, host: 'h', user: 'u', pass: 'p' } } })),
      ).toBeNull();
    });

    it('devuelve null si imap.enabled es false aunque mode sea real', () => {
      expect(
        (service as any).readConfig(tenant({ email: { mode: 'real', imap: { enabled: false, host: 'h', user: 'u', pass: 'p' } } })),
      ).toBeNull();
    });

    it('devuelve la config cuando mode=real e imap.enabled=true con credenciales', () => {
      const imap = { enabled: true, host: 'imap.office365.com', user: 'u', pass: 'p' };
      expect((service as any).readConfig(tenant({ email: { mode: 'real', imap } }))).toEqual(imap);
    });
  });
});
