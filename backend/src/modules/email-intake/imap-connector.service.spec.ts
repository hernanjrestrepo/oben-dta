import { simpleParser } from 'mailparser';
import { ImapFlow } from 'imapflow';
import { ImapConnectorService } from './imap-connector.service';
import { Tenant } from '../../entities/tenant.entity';
import { QuotesService } from '../quotes/quotes.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { FreightRateImportService } from '../freight-rates/freight-rate-import.service';
import { PackingListAutomationService } from '../packing-list/packing-list-automation.service';

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
  let freightRatesService: any;
  let packingListAutomation: any;
  let service: ImapConnectorService;

  beforeEach(() => {
    jest.clearAllMocks();

    intakeRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue({
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ raw: [{ id: 'row-1' }] }),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
        getRawOne: jest.fn().mockResolvedValue({ max: null }),
      }),
    };
    clientsRepo = { findOne: jest.fn().mockResolvedValue(null) };
    tenantsRepo = { find: jest.fn().mockResolvedValue([]) };

    classifiers = { resolve: jest.fn() };

    quotesService = { processIncomingEmail: jest.fn().mockResolvedValue({ quote: { id: 'Q-1' }, emailId: 'E-1' }) };
    poService = { processIncomingEmail: jest.fn().mockResolvedValue({ poDocument: { id: 'PO-1' } }) };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    tenantCtx = { setContext: jest.fn() };
    freightRatesService = {
      parseWorkbook: jest.fn().mockReturnValue({ inland: [{}], transload: [], surcharges: [] }),
      replaceAll: jest.fn().mockResolvedValue({
        sourceFile: 'rates.xlsx',
        inlandCount: 1,
        transloadCount: 0,
        surchargeCount: 0,
        importedAt: new Date(),
      }),
    };

    packingListAutomation = {
      handleOvApproved: jest.fn().mockResolvedValue({ sent: true, client: 'ACME', included: ['packing_list'], failed: [] }),
      recoverInterruptedOv: jest.fn().mockResolvedValue('queued'),
    };

    moduleRef = {
      resolve: jest.fn((type: unknown) => {
        if (type === TenantContext) return Promise.resolve(tenantCtx);
        if (type === QuotesService) return Promise.resolve(quotesService);
        if (type === PurchaseOrdersService) return Promise.resolve(poService);
        if (type === WorkflowAuditService) return Promise.resolve(auditService);
        if (type === PackingListAutomationService) return Promise.resolve(packingListAutomation);
        throw new Error(`tipo inesperado en test: ${String(type)}`);
      }),
    };

    service = new ImapConnectorService(
      tenantsRepo,
      clientsRepo,
      intakeRepo,
      classifiers,
      moduleRef,
      freightRatesService,
      { getAccessToken: jest.fn() } as never,
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

  it('enruta a FreightRateImportService cuando el clasificador dice freight_rates (maestro de fletes, NO es cotización)', async () => {
    classifiers.resolve.mockResolvedValue({
      classify: jest.fn().mockResolvedValue({ category: 'freight_rates', confidence: 0.9, provider: 'rules' }),
    });
    (simpleParser as unknown as jest.Mock).mockResolvedValue({
      messageId: '<msg-rates@corp.com>',
      from: { value: [{ address: 'rates@shapiro.com' }] },
      subject: 'Oben - Leg 3 USA Inland Rates - August 2026',
      text: 'Please find attached the updated inland trucking rates.',
      attachments: [
        { filename: 'Oben - Leg 3_USA Rates August 2026.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', content: Buffer.from('xlsx-bytes') },
      ],
    });
    const c = client();

    await (service as any).handleMessage(TENANT_ID, c, cfg, makeMsg());

    expect(freightRatesService.parseWorkbook).toHaveBeenCalledWith(Buffer.from('xlsx-bytes'));
    expect(freightRatesService.replaceAll).toHaveBeenCalledWith(
      TENANT_ID,
      'Oben - Leg 3_USA Rates August 2026.xlsx',
      { inland: [{}], transload: [], surcharges: [] },
    );
    expect(quotesService.processIncomingEmail).not.toHaveBeenCalled();
    expect(poService.processIncomingEmail).not.toHaveBeenCalled();
    const qb = intakeRepo.createQueryBuilder();
    expect(qb.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'processed', resultRef: 'inland:1 transload:0 recargos:0' }),
    );
  });

  it('"OV [n] Aprobada En Corte" dispara PackingListAutomationService SIN pasar por el clasificador de IA/reglas', async () => {
    (simpleParser as unknown as jest.Mock).mockResolvedValue({
      messageId: '<msg-ov@obengroup.com>',
      from: { value: [{ address: 'notif.app.co@obengroup.com' }] },
      subject: 'OV 10824 Aprobada En Corte',
      text: '',
      attachments: [],
    });
    const c = client();

    await (service as any).handleMessage(TENANT_ID, c, cfg, makeMsg());

    expect(packingListAutomation.handleOvApproved).toHaveBeenCalledWith(10824);
    expect(classifiers.resolve).not.toHaveBeenCalled();
    expect(quotesService.processIncomingEmail).not.toHaveBeenCalled();
    const qb = intakeRepo.createQueryBuilder();
    expect(qb.set).toHaveBeenCalledWith(
      expect.objectContaining({
        classificationCategory: 'packing_list_trigger',
        classificationConfidence: 1,
        status: 'processed',
        resultRef: '10824:packing_list',
      }),
    );
    expect(c.messageFlagsAdd).toHaveBeenCalledWith(String(42), ['\\Seen'], { uid: true });
    expect(c.messageMove).toHaveBeenCalledWith(String(42), 'Procesados', { uid: true });
  });

  it('si PackingListAutomationService falla, queda auditado como failed sin tumbar el conector', async () => {
    (simpleParser as unknown as jest.Mock).mockResolvedValue({
      messageId: '<msg-ov-2@obengroup.com>',
      from: { value: [{ address: 'notif.app.co@obengroup.com' }] },
      subject: 'OV 99999 Aprobada En Corte',
      text: '',
      attachments: [],
    });
    packingListAutomation.handleOvApproved.mockRejectedValue(new Error('no se pudo consultar la lista de empaque'));

    await expect(
      (service as any).handleMessage(TENANT_ID, client(), cfg, makeMsg()),
    ).resolves.toBeUndefined();

    const qb = intakeRepo.createQueryBuilder();
    expect(qb.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', errorMessage: 'no se pudo consultar la lista de empaque' }),
    );
  });

  it('freight_rates sin adjunto .xlsx reconocible queda skipped, no revienta', async () => {
    classifiers.resolve.mockResolvedValue({
      classify: jest.fn().mockResolvedValue({ category: 'freight_rates', confidence: 0.7, provider: 'rules' }),
    });
    (simpleParser as unknown as jest.Mock).mockResolvedValue({
      messageId: '<msg-rates-2@corp.com>',
      from: { value: [{ address: 'rates@shapiro.com' }] },
      subject: 'Trucking rates',
      text: 'texto sin adjunto',
      attachments: [],
    });

    await (service as any).handleMessage(TENANT_ID, client(), cfg, makeMsg());

    expect(freightRatesService.parseWorkbook).not.toHaveBeenCalled();
    const qb = intakeRepo.createQueryBuilder();
    expect(qb.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'skipped' }),
    );
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
    intakeRepo.findOne.mockResolvedValue({ movedToFolder: 'Procesados', status: 'processed' });
    classifiers.resolve.mockResolvedValue({ classify: jest.fn() });
    const c = client();

    await (service as any).handleMessage(TENANT_ID, c, cfg, makeMsg());

    expect(classifiers.resolve).not.toHaveBeenCalled();
    expect(quotesService.processIncomingEmail).not.toHaveBeenCalled();
    expect(c.messageFlagsAdd).toHaveBeenCalled();
  });

  it('deja el checkpoint en "processing" ANTES de disparar la lógica de negocio (claim previo al envío)', async () => {
    classifiers.resolve.mockResolvedValue({
      classify: jest.fn().mockResolvedValue({ category: 'quote_request', confidence: 0.7, provider: 'rules' }),
    });
    const qb = intakeRepo.createQueryBuilder();

    await (service as any).handleMessage(TENANT_ID, client(), cfg, makeMsg());

    expect(qb.values).toHaveBeenCalledWith(expect.objectContaining({ status: 'processing' }));
  });

  it('un messageId que quedó en "processing" (proceso interrumpido a mitad de envío, ej. un redeploy) NO se reenvía — se marca failed para revisión manual', async () => {
    (simpleParser as unknown as jest.Mock).mockResolvedValue({
      messageId: '<msg-ov-crash@obengroup.com>',
      from: { value: [{ address: 'notif.app.co@obengroup.com' }] },
      subject: 'OV 10981 Aprobada En Corte',
      text: '',
      attachments: [],
    });
    intakeRepo.findOne.mockResolvedValue({ status: 'processing', movedToFolder: null });
    const c = client();
    const qb = intakeRepo.createQueryBuilder();

    await (service as any).handleMessage(TENANT_ID, c, cfg, makeMsg());

    expect(packingListAutomation.handleOvApproved).not.toHaveBeenCalled();
    expect(qb.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', errorMessage: expect.stringContaining('interrumpido') }),
    );
    expect(c.messageFlagsAdd).toHaveBeenCalled();
  });

  it('si otro ciclo ya reclamó el messageId entre el findOne y el insert (ON CONFLICT DO NOTHING), no reprocesa', async () => {
    classifiers.resolve.mockResolvedValue({ classify: jest.fn() });
    const qb = intakeRepo.createQueryBuilder();
    qb.execute.mockResolvedValueOnce({ raw: [] }); // el claim (primer execute) no insertó nada
    const c = client();

    await (service as any).handleMessage(TENANT_ID, c, cfg, makeMsg());

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

    expect(qb.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', errorMessage: 'boom' }),
    );
    expect(c.messageFlagsAdd).toHaveBeenCalled();
  });

  describe('recoverOrphanedMessages (2026-09-23: OV 10983 y 11147 quedaron para siempre en processing tras reinicios del contenedor)', () => {
    const orphan = (over: Record<string, unknown> = {}) => ({
      messageId: '<ov-10983@obengroup.com>',
      imapUid: '900',
      subject: 'OV 10983 Aprobada En Corte',
      status: 'processing',
      receivedAt: new Date(Date.now() - 60 * 60_000),
      ...over,
    });

    it('una OV huérfana en processing se recupera vía recoverInterruptedOv y la fila queda processed', async () => {
      intakeRepo.find.mockResolvedValue([orphan()]);
      const c = client();
      const qb = intakeRepo.createQueryBuilder();

      await (service as any).recoverOrphanedMessages(TENANT_ID, c, cfg);

      expect(packingListAutomation.recoverInterruptedOv).toHaveBeenCalledWith(10983, expect.any(Date));
      expect(packingListAutomation.handleOvApproved).not.toHaveBeenCalled();
      expect(qb.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'processed', resultRef: '10983:recuperado_en_cola' }),
      );
      expect(c.messageFlagsAdd).toHaveBeenCalled();
    });

    it('si el envío ya había salido antes del corte, la fila queda processed con resultRef ya_enviado', async () => {
      intakeRepo.find.mockResolvedValue([orphan()]);
      packingListAutomation.recoverInterruptedOv.mockResolvedValue('already_sent');
      const qb = intakeRepo.createQueryBuilder();

      await (service as any).recoverOrphanedMessages(TENANT_ID, client(), cfg);

      expect(qb.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'processed', resultRef: '10983:ya_enviado_antes_del_corte' }),
      );
    });

    it('un correo que NO es de OV (efecto real no idempotente) no se reintenta a ciegas: queda failed para revisión manual', async () => {
      intakeRepo.find.mockResolvedValue([orphan({ subject: 'Solicitud de cotización' })]);
      const qb = intakeRepo.createQueryBuilder();

      await (service as any).recoverOrphanedMessages(TENANT_ID, client(), cfg);

      expect(packingListAutomation.recoverInterruptedOv).not.toHaveBeenCalled();
      expect(qb.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed', errorMessage: expect.stringContaining('interrumpido') }),
      );
    });

    it('una fila cuyo UID sigue en vuelo en este proceso NO se toca (es un procesamiento legítimo largo)', async () => {
      intakeRepo.find.mockResolvedValue([orphan()]);
      (service as any).getUidsInFlight(TENANT_ID).add(900);

      await (service as any).recoverOrphanedMessages(TENANT_ID, client(), cfg);

      expect(packingListAutomation.recoverInterruptedOv).not.toHaveBeenCalled();
    });

    it('una OV huérfana de MÁS de 24 h NO se recupera ni se reenvía: queda failed para revisión manual (incidente 2026-09-23: se reenviaron órdenes de hasta 3 semanas)', async () => {
      intakeRepo.find.mockResolvedValue([orphan({ receivedAt: new Date(Date.now() - 3 * 24 * 60 * 60_000) })]);
      const qb = intakeRepo.createQueryBuilder();

      await (service as any).recoverOrphanedMessages(TENANT_ID, client(), cfg);

      expect(packingListAutomation.recoverInterruptedOv).not.toHaveBeenCalled();
      expect(qb.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    });

    it('recupera como máximo 3 OV por ciclo aunque haya más huérfanas recientes (evita ráfagas de correos reales)', async () => {
      const recent = (n: number) =>
        orphan({ messageId: `<ov-${n}@x>`, imapUid: String(n), subject: `OV ${n} Aprobada En Corte`, receivedAt: new Date(Date.now() - 30 * 60_000) });
      intakeRepo.find.mockResolvedValue([recent(1001), recent(1002), recent(1003), recent(1004), recent(1005)]);

      await (service as any).recoverOrphanedMessages(TENANT_ID, client(), cfg);

      expect(packingListAutomation.recoverInterruptedOv).toHaveBeenCalledTimes(3);
    });

    it('un error al recuperar no se propaga (no debe tumbar el ciclo de lectura de correo)', async () => {
      intakeRepo.find.mockRejectedValue(new Error('db down'));

      await expect((service as any).recoverOrphanedMessages(TENANT_ID, client(), cfg)).resolves.toBeUndefined();
    });
  });

  describe('processUnseen — guardado contra reprocesamiento simultáneo del mismo UID', () => {
    it('si dos ciclos corren en paralelo (reconexión por watchdog a mitad de un envío lento), el mismo UID no se procesa ni se envía dos veces (bug real 2026-09-11: la OV 10981 se envió 3 veces)', async () => {
      (simpleParser as unknown as jest.Mock).mockResolvedValue({
        messageId: '<msg-ov-10981@obengroup.com>',
        from: { value: [{ address: 'notif.app.co@obengroup.com' }] },
        subject: 'OV 10981 Aprobada En Corte',
        text: '',
        attachments: [],
      });
      let resolveSlow!: () => void;
      const slow = new Promise<void>((resolve) => {
        resolveSlow = resolve;
      });
      packingListAutomation.handleOvApproved.mockImplementation(async () => {
        await slow; // simula el paquete completo de documentos, ahora lento (Lista Especial + Hoja de Costos)
        return { sent: true, client: 'ACME', included: ['lista_especial'], failed: [] };
      });

      const fakeClient = {
        status: jest.fn().mockResolvedValue({ uidNext: 43 }),
        fetch: jest.fn().mockImplementation(function fetchRange() {
          return (async function* () {
            yield makeMsg();
          })();
        }),
        messageFlagsAdd: jest.fn().mockResolvedValue(true),
        messageMove: jest.fn().mockResolvedValue(true),
      };

      // Dos ciclos de processUnseen corriendo a la vez sobre el mismo rango sin
      // procesar — exactamente lo que pasa cuando el watchdog fuerza una
      // reconexión mientras el ciclo anterior sigue enviando de fondo.
      const cycle1 = (service as any).processUnseen(TENANT_ID, fakeClient, cfg);
      await new Promise((r) => setImmediate(r)); // deja que cycle1 entre a handleMessage y quede esperando `slow`
      const cycle2 = (service as any).processUnseen(TENANT_ID, fakeClient, cfg);
      await new Promise((r) => setImmediate(r));

      resolveSlow();
      await Promise.all([cycle1, cycle2]);

      expect(packingListAutomation.handleOvApproved).toHaveBeenCalledTimes(1);
    });
  });

  describe('connectAndWatch — estabilidad del proceso ante errores de socket', () => {
    it('registra un listener de \'error\' en el cliente IMAP — sin esto, un hipo de red tumba TODO el proceso (bug real encontrado en vivo el 2026-08-26)', async () => {
      const fakeClient = {
        on: jest.fn(),
        connect: jest.fn().mockResolvedValue(undefined),
        getMailboxLock: jest.fn().mockResolvedValue({ release: jest.fn() }),
        idle: jest.fn().mockImplementation(() => new Promise(() => {})), // nunca resuelve — solo probamos el setup
        search: jest.fn().mockResolvedValue([]),
        status: jest.fn().mockResolvedValue({ uidNext: undefined }),
        logout: jest.fn().mockResolvedValue(undefined),
      };
      (ImapFlow as unknown as jest.Mock).mockImplementation(() => fakeClient);

      (service as any).connections.set(TENANT_ID, { client: null, stopped: false });
      void (service as any).connectAndWatch(TENANT_ID, cfg);

      await new Promise((r) => setTimeout(r, 0));

      expect(fakeClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('el watchdog del sleep de sondeo SUPERA pollIntervalMs (con el default de 20s un pollIntervalMs=30000 forzaba una reconexión completa en cada ciclo — bug real 2026-09-23)', async () => {
      const fakeClient = {
        on: jest.fn(),
        connect: jest.fn().mockResolvedValue(undefined),
        getMailboxLock: jest.fn().mockResolvedValue({ release: jest.fn() }),
        idle: jest.fn(),
        status: jest.fn().mockResolvedValue({ uidNext: undefined }),
        logout: jest.fn().mockResolvedValue(undefined),
      };
      (ImapFlow as unknown as jest.Mock).mockImplementation(() => fakeClient);
      const entry = { client: null, stopped: false };
      (service as any).connections.set(TENANT_ID, entry);
      (service as any).sleep = jest.fn().mockImplementation(async () => {
        entry.stopped = true; // un solo ciclo de sondeo y sale del loop
      });
      const watchdogSpy = jest.spyOn(service as any, 'withWatchdog');

      await (service as any).connectAndWatch(TENANT_ID, { ...cfg, pollIntervalMs: 30_000 });

      expect(fakeClient.idle).not.toHaveBeenCalled();
      const sleepCall = watchdogSpy.mock.calls.find((c: unknown[]) => c[1] === 'sleep');
      expect(sleepCall).toBeDefined();
      expect(sleepCall![2]).toBeGreaterThan(30_000);
    });
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
