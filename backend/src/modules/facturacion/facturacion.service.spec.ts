import { BadRequestException, ConflictException } from '@nestjs/common';
import { FacturacionService } from './facturacion.service';

const TENANT_ID = 't1';

function makeService(overrides: {
  hubResponses?: Record<string, unknown>;
  auditEvents?: Array<{ action: string; outputData?: Record<string, unknown> | null; createdAt?: Date; reason?: string | null }>;
  /** Eventos que devuelve audit.listByAction (órdenes recientes). */
  actionEvents?: Array<{ entityId: string; outputData?: Record<string, unknown> | null; createdAt: Date }>;
  distribution?: { to: string[]; cc: string[]; bcc: string[] };
  clientAddress?: string | null;
  /** Filas del maestro de clientes que coinciden por nombre (tiene prioridad sobre clientAddress). */
  clientMatches?: Array<{ address: string | null }>;
  pdfBuffer?: Buffer;
  /** Modo del adapter `dian` (default: mock, como hoy en producción). */
  dianMode?: 'mock' | 'real';
  idempotency?: FakeIdempotency;
} = {}) {
  const hub = {
    call: jest.fn(async (_system: string, op: string, args: Record<string, unknown>) => {
      if (op === 'query.run') {
        return overrides.hubResponses?.header ?? { ok: true, data: {} };
      }
      if (op === 'liquidacion.consultar') {
        return overrides.hubResponses?.check ?? { ok: true, data: {} };
      }
      if (op === 'proforma.status') {
        // Default: Oben+ no trae datos de esa Proforma.
        return overrides.hubResponses?.obenPlus ?? { ok: true, mode: 'mock', data: undefined };
      }
      if (op === 'invoice.send') {
        const dian = overrides.hubResponses?.dian;
        if (typeof dian === 'function') return (dian as (a: Record<string, unknown>) => unknown)(args);
        return dian ?? { ok: true, mode: overrides.dianMode ?? 'mock', data: { invoiceNumber: args.invoiceNumber, cufe: 'cufe-sim-123', status: 'ACEPTADA', dianReceivedAt: '2026-09-27T10:00:00.000Z' } };
      }
      if (op === 'send') {
        return overrides.hubResponses?.send ?? { ok: true, data: { id: 'msg-1' } };
      }
      return { ok: false, error: `op inesperada ${op}` };
    }),
    capabilities: jest.fn(async () => ({ system: 'dian', mode: overrides.dianMode ?? 'mock', capabilities: [] })),
  } as any;
  const ctx = { tenantId: TENANT_ID, userId: 'u1' } as any;
  const audit = {
    log: jest.fn().mockResolvedValue(undefined),
    listForEntity: jest.fn().mockResolvedValue(overrides.auditEvents ?? []),
    listByAction: jest.fn().mockResolvedValue(overrides.actionEvents ?? []),
  } as any;
  const distributionLists = {
    resolveRecipients: jest.fn().mockResolvedValue(overrides.distribution ?? { to: [], cc: [], bcc: [] }),
  } as any;
  const pdf = { build: jest.fn().mockResolvedValue(overrides.pdfBuffer ?? Buffer.from('pdf')) } as any;
  const matches =
    overrides.clientMatches ??
    (overrides.clientAddress !== undefined && overrides.clientAddress !== null ? [{ address: overrides.clientAddress }] : []);
  const clients = { find: jest.fn().mockResolvedValue(matches) } as any;
  const idempotency = overrides.idempotency ?? new FakeIdempotency();
  const service = new FacturacionService(hub, ctx, audit, distributionLists, pdf, clients, idempotency as any);
  return { service, hub, audit, distributionLists, pdf, clients, idempotency };
}

/** Misma semántica que IdempotencyService (claim atómico, estados, reclaim atómico de 'failed'). */
class FakeIdempotency {
  rows = new Map<string, { status: 'processing' | 'completed' | 'failed'; result?: unknown; error?: string }>();
  async claim(_t: string, _e: string, key: string) {
    const ex = this.rows.get(key);
    if (ex) return { claimed: false, existingStatus: ex.status, existingResult: ex.result };
    this.rows.set(key, { status: 'processing' });
    return { claimed: true };
  }
  async saveProgress(_t: string, key: string, result: unknown) {
    this.rows.get(key)!.result = result;
  }
  async markCompleted(_t: string, key: string, result: unknown) {
    Object.assign(this.rows.get(key)!, { status: 'completed', result });
  }
  async markFailed(_t: string, key: string, error: string) {
    Object.assign(this.rows.get(key)!, { status: 'failed', error });
  }
  async reclaimFailed(_t: string, key: string) {
    if (this.rows.get(key)?.status !== 'failed') return false;
    this.rows.get(key)!.status = 'processing';
    return true;
  }
}

const HEADER_EXPORT = { ok: true, data: { Cliente: 'OBEN US, LLC', Pais: 'USA', Proforma: '11271', Contenedor: 'CONT1', CodigoMaterial: 'SC15TN', OrdenCompra: '128353' } };
const HEADER_NACIONAL = { ok: true, data: { Cliente: 'CLIENTE NACIONAL SAS', Pais: 'COLOMBIA', Proforma: '10867' } };
const CHECK_OK = { ok: true, data: { Proforma: '11271', OrdenVenta: '11086', OrdenCompra: '128353', Cliente: 'OBEN US, LLC', Detalle: [{ CodSed_LineFilm: 113, TipoPelicula: 'ENA--0012TM', Precio: 2.827, KilosTotales: 1339.42 }] } };
const header = (data: Record<string, unknown>) => ({ ok: true, data: { Cliente: 'X SAS', Proforma: '10867', ...data } });
const sendCalls = (hub: { call: jest.Mock }) => hub.call.mock.calls.filter((c: unknown[]) => c[1] === 'send');
const dianCalls = (hub: { call: jest.Mock }) => hub.call.mock.calls.filter((c: unknown[]) => c[1] === 'invoice.send');
const OBEN_PLUS_OK = { ok: true, mode: 'mock', data: { simulated: true, numberPF: '11271', direccionEntrega: 'DIRECCIÓN SIMULADA (Oben+ mock) — Bodega 3, USA' } };

describe('FacturacionService (borrador de facturación)', () => {
  it('clasifica como exportación cuando el país no es Colombia y bloquea sin dirección de entrega', async () => {
    const { service } = makeService({ hubResponses: { header: HEADER_EXPORT, check: CHECK_OK } });

    const draft = await service.getDraft(11086);

    expect(draft.kind).toBe('exportacion');
    expect(draft.lines).toHaveLength(1);
    expect(draft.totalKilos).toBeCloseTo(1339.42);
    expect(draft.missing).toEqual(expect.arrayContaining([expect.stringContaining('Dirección de entrega')]));
    expect(draft.readyToGenerate).toBe(false);
  });

  it('resuelve la dirección desde el maestro de clientes cuando existe (nunca la inventa)', async () => {
    const { service } = makeService({
      hubResponses: { header: HEADER_EXPORT, check: CHECK_OK },
      clientAddress: '123 Export Way, Miami FL',
    });

    const draft = await service.getDraft(11086);

    expect(draft.direccionEntrega).toBe('123 Export Way, Miami FL');
    expect(draft.direccionFuente).toBe('maestro_clientes');
    expect(draft.readyToGenerate).toBe(true);
  });

  it('un pedido nacional no exige dirección de entrega para estar listo', async () => {
    const { service } = makeService({
      hubResponses: {
        header: HEADER_NACIONAL,
        check: { ok: true, data: { Detalle: [{ CodSed_LineFilm: 6, TipoPelicula: 'SC---0020TN', Precio: 2.55, KilosTotales: 22080.76 }] } },
      },
    });

    const draft = await service.getDraft(10758);

    expect(draft.kind).toBe('nacional_completo');
    expect(draft.missing).toEqual([]);
    expect(draft.readyToGenerate).toBe(true);
  });

  it('nacional_parcial cuando input.parcial es true', async () => {
    const { service } = makeService({ hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK } });
    const draft = await service.getDraft(10758, { parcial: true });
    expect(draft.kind).toBe('nacional_parcial');
  });

  it('sin Proforma en la respuesta de Oben, lo marca como faltante y no intenta pedir precios', async () => {
    const { service, hub } = makeService({ hubResponses: { header: { ok: true, data: { Cliente: 'X', Pais: 'COLOMBIA' } } } });

    const draft = await service.getDraft(1);

    expect(draft.missing).toEqual(expect.arrayContaining([expect.stringContaining('Proforma')]));
    expect(hub.call).not.toHaveBeenCalledWith(expect.anything(), 'liquidacion.consultar', expect.anything(), expect.anything());
  });

  it('campos de Oben que llegan como número (Proforma 11271, OrdenCompra) no revientan el borrador', async () => {
    const { service, hub } = makeService({
      hubResponses: { header: header({ Pais: 'USA', Proforma: 11271, OrdenCompra: 128353, Contenedor: null }), check: CHECK_OK },
    });

    const draft = await service.getDraft(11086);

    expect(draft).toMatchObject({ proforma: '11271', ordenCompra: '128353', contenedor: null, kind: 'exportacion' });
    expect(hub.call).toHaveBeenCalledWith('obenCostOrder', 'liquidacion.consultar', { numberPF: '11271' }, expect.anything());
  });

  it('un Cliente que no es texto (null/objeto) cuenta como respuesta vacía de Oben', async () => {
    const { service } = makeService({ hubResponses: { header: { ok: true, data: { Cliente: { nombre: 'X' }, Pais: 'USA' } } } });
    const draft = await service.getDraft(1);
    expect(draft.cliente).toBe('');
    expect(draft.missing).toEqual([expect.stringContaining('spEmpaqueUnificada_Paradixe')]);
  });

  describe('clasificación Exportación / Nacional', () => {
    it.each(['COLOMBIA', 'Colombia', '  colombia  ', 'COL'])('país %j → nacional', async (pais) => {
      const { service } = makeService({ hubResponses: { header: header({ Pais: pais }), check: CHECK_OK } });
      const draft = await service.getDraft(1);
      expect(draft.kind).toBe('nacional_completo');
    });

    it.each(['USA', 'ECUADOR', 'PANAMA', 'BRASIL', 'COSTA RICA'])('país %j → exportación', async (pais) => {
      const { service } = makeService({ hubResponses: { header: header({ Pais: pais }), check: CHECK_OK } });
      const draft = await service.getDraft(1);
      expect(draft.kind).toBe('exportacion');
    });

    it('sin país NO se asume exportación: kind=null, se lista el faltante y no se exige dirección "de exportación"', async () => {
      const { service } = makeService({ hubResponses: { header: header({ Pais: '   ' }), check: CHECK_OK } });

      const draft = await service.getDraft(1);

      expect(draft.kind).toBeNull();
      expect(draft.pais).toBeNull();
      expect(draft.missing).toEqual([expect.stringContaining('País de destino')]);
      expect(draft.readyToGenerate).toBe(false);
    });

    it('si Oben no responde el encabezado: kind=null, no se consultan precios ni el maestro de clientes', async () => {
      const { service, hub, clients } = makeService({ hubResponses: { header: { ok: false, error: 'timeout' } } });

      const draft = await service.getDraft(1);

      expect(draft.kind).toBeNull();
      expect(draft.missing).toEqual([expect.stringContaining('spEmpaqueUnificada_Paradixe')]);
      expect(hub.call).toHaveBeenCalledTimes(1);
      expect(clients.find).not.toHaveBeenCalled();
    });

    it('parcial:true no convierte un pedido de exportación en nacional', async () => {
      const { service } = makeService({ hubResponses: { header: HEADER_EXPORT, check: CHECK_OK } });
      const draft = await service.getDraft(11086, { parcial: true });
      expect(draft.kind).toBe('exportacion');
    });

    it('generateDocument sin país lanza BadRequest (nunca arma un PDF sin clasificar)', async () => {
      const { service, pdf } = makeService({ hubResponses: { header: header({}), check: CHECK_OK } });
      await expect(service.generateDocument(1)).rejects.toThrow(BadRequestException);
      expect(pdf.build).not.toHaveBeenCalled();
    });
  });

  describe('dirección de entrega', () => {
    it('la dirección digitada manda y no se consulta el maestro', async () => {
      const { service, clients } = makeService({ hubResponses: { header: HEADER_EXPORT, check: CHECK_OK }, clientAddress: 'otra' });

      const draft = await service.getDraft(11086, { direccionEntrega: '  1 Port Rd, Miami FL ' });

      expect(draft.direccionEntrega).toBe('1 Port Rd, Miami FL');
      expect(draft.direccionFuente).toBe('digitada');
      expect(clients.find).not.toHaveBeenCalled();
      expect(draft.readyToGenerate).toBe(true);
    });

    it('una dirección digitada en blanco cuenta como ausente', async () => {
      const { service } = makeService({ hubResponses: { header: HEADER_EXPORT, check: CHECK_OK } });
      const draft = await service.getDraft(11086, { direccionEntrega: '   ' });
      expect(draft.direccionEntrega).toBeNull();
      expect(draft.readyToGenerate).toBe(false);
    });

    it('si el nombre coincide con MÁS de un cliente del maestro no elige ninguno (sería adivinar)', async () => {
      const { service } = makeService({
        hubResponses: { header: HEADER_EXPORT, check: CHECK_OK },
        clientMatches: [{ address: 'Dirección A' }, { address: 'Dirección B' }],
      });

      const draft = await service.getDraft(11086);

      expect(draft.direccionEntrega).toBeNull();
      expect(draft.direccionFuente).toBeNull();
      expect(draft.missing).toEqual(expect.arrayContaining([expect.stringContaining('más de un cliente')]));
      expect(draft.readyToGenerate).toBe(false);
    });

    it('una dirección vacía en el maestro no cuenta como dirección', async () => {
      const { service } = makeService({ hubResponses: { header: HEADER_EXPORT, check: CHECK_OK }, clientAddress: '  ' });
      const draft = await service.getDraft(11086);
      expect(draft.direccionEntrega).toBeNull();
      expect(draft.readyToGenerate).toBe(false);
    });

    it('escapa % y _ del nombre del cliente (ILIKE no debe emparejar a otro cliente)', async () => {
      const { service, clients } = makeService({
        hubResponses: { header: header({ Cliente: 'ACME_100% SAS', Pais: 'USA' }), check: CHECK_OK },
      });

      await service.getDraft(1);

      const where = clients.find.mock.calls[0][0].where;
      expect(where.tenantId).toBe(TENANT_ID);
      expect(where.name.value).toBe('ACME\\_100\\% SAS');
    });
  });

  describe('precios por película (spCheckSettlement)', () => {
    it('un Precio null NO se convierte en 0: la línea no se usa y queda como faltante', async () => {
      const { service } = makeService({
        hubResponses: {
          header: HEADER_NACIONAL,
          check: { ok: true, data: { Detalle: [{ CodSed_LineFilm: 6, TipoPelicula: 'SC', Precio: null, KilosTotales: 100 }] } },
        },
      });

      const draft = await service.getDraft(10758);

      expect(draft.lines).toEqual([]);
      expect(draft.totalValor).toBe(0);
      expect(draft.missing).toEqual([expect.stringContaining('Precios por película')]);
      expect(draft.readyToGenerate).toBe(false);
    });

    it.each([[''], ['abc'], [true]])('KilosTotales=%j se rechaza (no es un número real)', async (kilos) => {
      const { service } = makeService({
        hubResponses: {
          header: HEADER_NACIONAL,
          check: { ok: true, data: { Detalle: [{ CodSed_LineFilm: 6, TipoPelicula: 'SC', Precio: 2, KilosTotales: kilos }] } },
        },
      });
      const draft = await service.getDraft(10758);
      expect(draft.readyToGenerate).toBe(false);
      expect(draft.lines).toEqual([]);
    });

    it('acepta números que Oben mande como string y suma/redondea los totales', async () => {
      const { service } = makeService({
        hubResponses: {
          header: HEADER_NACIONAL,
          check: {
            ok: true,
            data: {
              Detalle: [
                { CodSed_LineFilm: '1', TipoPelicula: 'A', Precio: '2.827', KilosTotales: '1339.42' },
                { CodSed_LineFilm: 2, TipoPelicula: 'B', Precio: 3, KilosTotales: 200.25 },
              ],
            },
          },
        },
      });

      const draft = await service.getDraft(10758);

      expect(draft.lines.map((l) => [l.codSecLineFilm, l.valorLinea])).toEqual([
        [1, 3786.54],
        [2, 600.75],
      ]);
      expect(draft.totalValor).toBe(4387.29);
      expect(draft.totalKilos).toBe(1539.67);
    });

    it('si spCheckSettlement falla, se lista como faltante (no se arma un borrador sin precios)', async () => {
      const { service } = makeService({ hubResponses: { header: HEADER_NACIONAL, check: { ok: false, error: 'timeout' } } });
      const draft = await service.getDraft(10758);
      expect(draft.missing).toEqual([expect.stringContaining('Proforma 10867')]);
      expect(draft.readyToGenerate).toBe(false);
    });

    it('usa OBEN_QUERY_OPTIONS (sin reintentos) en toda lectura contra Oben', async () => {
      const { service, hub } = makeService({ hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK } });
      await service.getDraft(10758);
      for (const call of hub.call.mock.calls) {
        expect(call[3]).toEqual({ maxAttempts: 1, timeoutMs: 30_000 });
      }
    });
  });

  it('generateDocument lanza BadRequestException si el borrador no está listo (nunca genera con datos faltantes)', async () => {
    const { service } = makeService({ hubResponses: { header: HEADER_EXPORT, check: CHECK_OK } });
    await expect(service.generateDocument(11086)).rejects.toThrow(BadRequestException);
  });

  it('generateDocument arma el PDF cuando el borrador está completo', async () => {
    const { service, pdf } = makeService({
      hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK },
    });

    const doc = await service.generateDocument(10758);

    expect(pdf.build).toHaveBeenCalled();
    expect(doc.filename).toBe('Factura_Borrador-OV10758.pdf');
  });

  describe('send', () => {
    const COMEX = { to: ['comex@oben.com'], cc: [], bcc: [] };

    it('lanza BadRequestException si no hay lista de distribución "facturacion" configurada', async () => {
      const { service } = makeService({ hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK } });
      await expect(service.send(10758)).rejects.toThrow(BadRequestException);
    });

    it('bloquea un segundo envío accidental para la misma orden salvo force:true', async () => {
      const { service, hub } = makeService({
        hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK },
        auditEvents: [{ action: 'facturacion_enviada', outputData: { ok: true } }],
        distribution: COMEX,
      });

      await expect(service.send(10758)).rejects.toThrow(ConflictException);
      expect(sendCalls(hub)).toHaveLength(0);
    });

    it('un evento de envío sin el campo ok (histórico) sigue bloqueando — ante la duda, no duplicar', async () => {
      const { service } = makeService({
        hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK },
        auditEvents: [{ action: 'facturacion_enviada', outputData: null }],
        distribution: COMEX,
      });
      await expect(service.send(10758)).rejects.toThrow(ConflictException);
    });

    it('un intento anterior FALLIDO (ok:false) no bloquea el reintento con un "ya se envió" falso', async () => {
      const { service, hub } = makeService({
        hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK },
        auditEvents: [{ action: 'facturacion_enviada', outputData: { ok: false } }],
        distribution: COMEX,
      });

      const result = await service.send(10758);

      expect(result.sent).toBe(true);
      expect(sendCalls(hub)).toHaveLength(1);
    });

    it('force:true reenvía aunque ya exista un envío exitoso, sin consultar la auditoría', async () => {
      const { service, hub, audit } = makeService({
        hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK },
        auditEvents: [{ action: 'facturacion_enviada', outputData: { ok: true } }],
        distribution: COMEX,
      });

      await service.send(10758, {}, true);

      expect(audit.listForEntity).not.toHaveBeenCalled();
      expect(sendCalls(hub)).toHaveLength(1);
    });

    it('con datos faltantes NO envía ningún correo', async () => {
      const { service, hub } = makeService({ hubResponses: { header: HEADER_EXPORT, check: CHECK_OK }, distribution: COMEX });
      await expect(service.send(11086)).rejects.toThrow(BadRequestException);
      expect(sendCalls(hub)).toHaveLength(0);
    });

    it('si el correo falla: audita el intento con ok:false y el motivo, y lanza (nunca devuelve sent:true)', async () => {
      const { service, audit } = makeService({
        hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK, send: { ok: false, error: 'timeout: sin respuesta de email.send tras 30000ms' } },
        distribution: COMEX,
      });

      await expect(service.send(10758)).rejects.toThrow(/timeout/);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'facturacion_enviada',
          outputData: expect.objectContaining({ ok: false, messageId: null }),
          reason: expect.stringContaining('timeout'),
        }),
      );
    });

    it('envía el correo con el PDF adjunto, sin reintentos automáticos, y audita el envío', async () => {
      const { service, hub, audit } = makeService({
        hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK },
        distribution: { to: ['comex@oben.com', 'jefe@oben.com'], cc: ['distribucion@oben.com'], bcc: [] },
      });

      const result = await service.send(10758, { direccionEntrega: 'Galapa' });

      expect(result).toEqual({
        sent: true,
        to: ['comex@oben.com'],
        cc: ['jefe@oben.com', 'distribucion@oben.com'],
        filename: 'Factura_Borrador-OV10758.pdf',
        cufe: 'cufe-sim-123',
        cufeSimulado: true,
        simulated: true,
      });
      const [sendCall] = sendCalls(hub);
      expect(sendCall[2]).toMatchObject({ to: 'comex@oben.com', cc: 'jefe@oben.com,distribucion@oben.com' });
      expect(sendCall[2].attachments).toHaveLength(1);
      expect(sendCall[2].attachments[0].contentType).toBe('application/pdf');
      expect(sendCall[3]).toMatchObject({ maxAttempts: 1 });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'facturacion_enviada', outputData: expect.objectContaining({ ok: true, messageId: 'msg-1' }) }),
      );
    });
  });
  describe('dirección de entrega desde spCheckSettlement (ERP de Oben, José pregunta 9)', () => {
    it('sin dirección digitada ni en el maestro, la toma del ERP (fuente real) antes que de Oben+ simulado', async () => {
      const { service, hub } = makeService({
        hubResponses: {
          header: HEADER_EXPORT,
          check: { ok: true, data: { ...CHECK_OK.data, Direccion: '1 Port Rd, Miami FL' } },
          obenPlus: OBEN_PLUS_OK,
        },
      });
      const draft = await service.getDraft(11086);
      expect(draft).toMatchObject({ direccionEntrega: '1 Port Rd, Miami FL', direccionFuente: 'oben_erp', readyToGenerate: true, simulated: false });
      expect(hub.call.mock.calls.some((c: unknown[]) => c[1] === 'proforma.status')).toBe(false);
    });

    it('el maestro de clientes sigue teniendo prioridad sobre el ERP', async () => {
      const { service } = makeService({
        hubResponses: { header: HEADER_EXPORT, check: { ok: true, data: { ...CHECK_OK.data, Direccion: 'ERP' } } },
        clientAddress: 'Maestro',
      });
      expect((await service.getDraft(11086)).direccionFuente).toBe('maestro_clientes');
    });
  });

  describe('dirección de entrega desde Oben+ (fuente SIMULADA, rotulada)', () => {
    it('exportación sin dirección digitada ni en el maestro → la toma de la Proforma en Oben+ y la marca como simulada', async () => {
      const { service, hub } = makeService({ hubResponses: { header: HEADER_EXPORT, check: CHECK_OK, obenPlus: OBEN_PLUS_OK } });

      const draft = await service.getDraft(11086);

      expect(draft).toMatchObject({
        direccionEntrega: 'DIRECCIÓN SIMULADA (Oben+ mock) — Bodega 3, USA',
        direccionFuente: 'oben_plus',
        simulated: true,
        simulatedFields: ['direccionEntrega'],
        readyToGenerate: true,
      });
      expect(hub.call).toHaveBeenCalledWith('obenPlus', 'proforma.status', { numberPF: '11271' }, { maxAttempts: 1, timeoutMs: 30_000 });
    });

    it('si Oben+ responde en modo real (sin marca simulated), la dirección NO queda marcada como simulada', async () => {
      const { service } = makeService({
        hubResponses: { header: HEADER_EXPORT, check: CHECK_OK, obenPlus: { ok: true, mode: 'real', data: { direccionEntrega: '1 Port Rd, Miami FL' } } },
      });
      const draft = await service.getDraft(11086);
      expect(draft).toMatchObject({ direccionFuente: 'oben_plus', simulated: false, simulatedFields: [] });
    });

    it.each([
      ['la dirección digitada', { direccionEntrega: 'Digitada 1' }, undefined, HEADER_EXPORT],
      ['el maestro de clientes', {}, 'Maestro 1', HEADER_EXPORT],
      ['un pedido nacional (no exige dirección)', {}, undefined, HEADER_NACIONAL],
    ])('no consulta Oben+ cuando ya hay %s', async (_caso, input, clientAddress, headerRes) => {
      const { service, hub } = makeService({
        hubResponses: { header: headerRes, check: CHECK_OK, obenPlus: OBEN_PLUS_OK },
        clientAddress: clientAddress as string | undefined,
      });
      const draft = await service.getDraft(1, input);
      expect(hub.call).not.toHaveBeenCalledWith('obenPlus', 'proforma.status', expect.anything(), expect.anything());
      expect(draft.simulated).toBe(false);
    });

    it('con el maestro AMBIGUO (dos clientes) sí recurre a la Proforma en Oben+ (no es ambigua)', async () => {
      const { service } = makeService({
        hubResponses: { header: HEADER_EXPORT, check: CHECK_OK, obenPlus: OBEN_PLUS_OK },
        clientMatches: [{ address: 'A' }, { address: 'B' }],
      });
      expect((await service.getDraft(11086)).direccionFuente).toBe('oben_plus');
    });

    it('si Oben+ falla, la dirección sigue faltando (y el mensaje lo dice)', async () => {
      const { service } = makeService({
        hubResponses: { header: HEADER_EXPORT, check: CHECK_OK, obenPlus: { ok: false, mode: 'mock', error: 'timeout' } },
      });
      const draft = await service.getDraft(11086);
      expect(draft.readyToGenerate).toBe(false);
      expect(draft.missing).toEqual([expect.stringContaining('ni la Proforma en Oben+')]);
    });
  });

  describe('factura electrónica DIAN (simulador del hub) — emisión idempotente', () => {
    const COMEX = { to: ['comex@oben.com'], cc: [], bcc: [] };

    it('send emite UNA factura con el total real del borrador y rotula el CUFE simulado en correo y PDF', async () => {
      const { service, hub, audit, pdf } = makeService({ hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK }, distribution: COMEX });

      const result = await service.send(10758);

      const [dian] = dianCalls(hub);
      expect(dian[0]).toBe('dian');
      expect(dian[2]).toMatchObject({ invoiceNumber: 'OV10758', totalAmount: 3786.54, cliente: 'CLIENTE NACIONAL SAS' });
      expect(dian[3]).toMatchObject({ maxAttempts: 1 });
      expect(result).toMatchObject({ cufe: 'cufe-sim-123', cufeSimulado: true, simulated: true });

      const [email] = sendCalls(hub);
      expect(email[2].subject).toBe('[SIMULADO] Borrador de Facturación — Orden 10758');
      expect(email[2].body).toContain('CUFE SIMULADO — pendiente de proveedor DIAN real');
      expect(email[2].body).toContain('cufe-sim-123');
      expect(pdf.build).toHaveBeenCalledWith(
        expect.objectContaining({ numberOrderSales: 10758 }),
        expect.objectContaining({ cufe: 'cufe-sim-123', simulated: true }),
      );
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'facturacion_dian_emitida' }));
    });

    it('la dirección simulada también se rotula en el correo', async () => {
      const { service, hub } = makeService({ hubResponses: { header: HEADER_EXPORT, check: CHECK_OK, obenPlus: OBEN_PLUS_OK }, distribution: COMEX });
      await service.send(11086);
      expect(sendCalls(hub)[0][2].body).toContain('Dirección de entrega SIMULADA');
    });

    it('reenviar (force) o reintentar tras un correo fallido reutiliza el MISMO CUFE: nunca emite dos veces', async () => {
      const idempotency = new FakeIdempotency();
      const base = { hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK }, distribution: COMEX, idempotency };
      const primero = makeService({ ...base, hubResponses: { ...base.hubResponses, send: { ok: false, error: 'smtp down' } } });
      await expect(primero.service.send(10758)).rejects.toThrow(/smtp down/);
      expect(dianCalls(primero.hub)).toHaveLength(1);

      const segundo = makeService(base);
      const r2 = await segundo.service.send(10758);
      const r3 = await segundo.service.send(10758, {}, true);

      expect(dianCalls(segundo.hub)).toHaveLength(0);
      expect([r2.cufe, r3.cufe]).toEqual(['cufe-sim-123', 'cufe-sim-123']);
    });

    it('descargar el PDF NUNCA emite: sin emisión previa lo muestra "pendiente"; con emisión previa muestra ese CUFE', async () => {
      const sinEmitir = makeService({ hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK } });
      const doc = await sinEmitir.service.generateDocument(10758);
      expect(dianCalls(sinEmitir.hub)).toHaveLength(0);
      expect(doc.facturaElectronica).toBeNull();
      expect(sinEmitir.pdf.build).toHaveBeenCalledWith(expect.anything(), null);

      const emitida = makeService({
        hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK },
        auditEvents: [{ action: 'facturacion_dian_emitida', outputData: { invoiceNumber: 'OV10758', cufe: 'abc', status: 'ACEPTADA', simulated: true, emitidaEn: null } }],
      });
      const doc2 = await emitida.service.generateDocument(10758);
      expect(dianCalls(emitida.hub)).toHaveLength(0);
      expect(doc2.facturaElectronica).toMatchObject({ cufe: 'abc', simulated: true });
    });

    it('si DIAN rechaza, no se envía ningún correo; el siguiente intento reintenta la emisión', async () => {
      const idempotency = new FakeIdempotency();
      const rechazo = makeService({
        hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK, dian: { ok: false, mode: 'mock', error: 'BUSINESS_ERROR: NIT inválido' } },
        distribution: COMEX,
        idempotency,
      });
      await expect(rechazo.service.send(10758)).rejects.toThrow(/NIT inválido/);
      expect(sendCalls(rechazo.hub)).toHaveLength(0);
      expect(idempotency.rows.get('facturacion:dian:mock:10758')).toMatchObject({ status: 'failed', result: { ambiguous: false } });

      const ok = makeService({ hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK }, distribution: COMEX, idempotency });
      await expect(ok.service.send(10758)).resolves.toMatchObject({ cufe: 'cufe-sim-123' });
      expect(dianCalls(ok.hub)).toHaveLength(1);
    });

    it('con un proveedor DIAN REAL, un fallo ambiguo (timeout) bloquea el reintento: la factura pudo haberse emitido', async () => {
      const idempotency = new FakeIdempotency();
      const base = { distribution: COMEX, idempotency, dianMode: 'real' as const };
      const timeout = makeService({
        ...base,
        hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK, dian: { ok: false, mode: 'real', error: 'timeout: sin respuesta tras 60000ms' } },
      });
      await expect(timeout.service.send(10758, { direccionEntrega: 'Galapa' })).rejects.toThrow(/timeout/);

      const reintento = makeService({ ...base, hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK } });
      await expect(reintento.service.send(10758, { direccionEntrega: 'Galapa' })).rejects.toThrow(/ambiguo/);
      expect(dianCalls(reintento.hub)).toHaveLength(0);
    });

    it('con el simulador, un timeout sí se puede reintentar (no hay efecto real que duplicar)', async () => {
      const idempotency = new FakeIdempotency();
      const timeout = makeService({
        hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK, dian: { ok: false, mode: 'mock', error: 'timeout: sin respuesta' } },
        distribution: COMEX,
        idempotency,
      });
      await expect(timeout.service.send(10758)).rejects.toThrow(/timeout/);
      const reintento = makeService({ hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK }, distribution: COMEX, idempotency });
      await expect(reintento.service.send(10758)).resolves.toMatchObject({ cufe: 'cufe-sim-123' });
    });

    it('DIAN responde OK pero sin CUFE → se trata como ambiguo y no se envía el correo', async () => {
      const idempotency = new FakeIdempotency();
      const { service, hub } = makeService({
        hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK, dian: { ok: true, mode: 'mock', data: { status: 'ACEPTADA' } } },
        distribution: COMEX,
        idempotency,
      });
      await expect(service.send(10758)).rejects.toThrow(/no trae CUFE/);
      expect(sendCalls(hub)).toHaveLength(0);
      expect(idempotency.rows.get('facturacion:dian:mock:10758')?.result).toMatchObject({ ambiguous: true });
    });

    it('si la emisión de esa orden está en curso en otra solicitud → Conflict, sin llamar a DIAN', async () => {
      const idempotency = new FakeIdempotency();
      idempotency.rows.set('facturacion:dian:mock:10758', { status: 'processing' });
      const { service, hub } = makeService({ hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK }, distribution: COMEX, idempotency });
      await expect(service.send(10758)).rejects.toThrow(ConflictException);
      expect(dianCalls(hub)).toHaveLength(0);
    });

    it('CANDADO: con un proveedor DIAN REAL nunca se emite una factura con datos simulados (dirección de Oben+ simulado)', async () => {
      const { service, hub, idempotency } = makeService({
        hubResponses: { header: HEADER_EXPORT, check: CHECK_OK, obenPlus: OBEN_PLUS_OK },
        distribution: COMEX,
        dianMode: 'real',
      });

      await expect(service.send(11086)).rejects.toThrow(/datos SIMULADOS \(direccionEntrega\)/);

      expect(dianCalls(hub)).toHaveLength(0);
      expect(sendCalls(hub)).toHaveLength(0);
      expect(idempotency.rows.size).toBe(0);
    });

    it('con DIAN real y datos reales: emite, y el correo NO lleva ningún rótulo de simulación', async () => {
      const { service, hub } = makeService({
        hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK },
        distribution: COMEX,
        dianMode: 'real',
      });

      const result = await service.send(10758);

      expect(result).toMatchObject({ cufeSimulado: false, simulated: false });
      const [email] = sendCalls(hub);
      expect(email[2].subject).toBe('Borrador de Facturación — Orden 10758');
      expect(email[2].body).not.toMatch(/SIMULAD/);
    });

    it('un CUFE SIMULADO nunca queda como la factura de la orden cuando se conecta el proveedor REAL', async () => {
      // Antes la clave de idempotencia era solo la orden: una emisión del
      // simulador (p. ej. en un demo) se devolvía para siempre, también con DIAN real.
      const idempotency = new FakeIdempotency();
      const base = { hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK }, distribution: COMEX, idempotency };
      const demo = await makeService(base).service.send(10758);
      expect(demo).toMatchObject({ cufe: 'cufe-sim-123', cufeSimulado: true });

      const real = makeService({
        ...base,
        dianMode: 'real',
        hubResponses: {
          ...base.hubResponses,
          dian: { ok: true, mode: 'real', data: { invoiceNumber: 'OV10758', cufe: 'cufe-REAL-9', status: 'ACEPTADA' } },
        },
      });
      const res = await real.service.send(10758, {}, true);

      expect(dianCalls(real.hub)).toHaveLength(1);
      expect(res).toMatchObject({ cufe: 'cufe-REAL-9', cufeSimulado: false });
      expect([...idempotency.rows.keys()].sort()).toEqual(['facturacion:dian:mock:10758', 'facturacion:dian:real:10758']);
    });

    it('con DIAN real, el PDF descargado no muestra una emisión SIMULADA previa como si fuera la factura', async () => {
      const { service } = makeService({
        hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK },
        dianMode: 'real',
        auditEvents: [{ action: 'facturacion_dian_emitida', outputData: { cufe: 'abc', simulated: true } }],
      });
      expect((await service.generateDocument(10758)).facturaElectronica).toBeNull();
    });
  });

  describe('destinatarios explícitos (los que se ven en pantalla)', () => {
    const COMEX = { to: ['comex@oben.com'], cc: [], bcc: [] };

    it('mandan sobre la lista de distribución: primero en "para", el resto en copia, sin repetidos', async () => {
      const { service, hub, distributionLists } = makeService({
        hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK },
        distribution: COMEX,
      });

      const res = await service.send(10758, {}, false, {
        to: [' JorgeRestrepo@obengroup.com', 'joseguzman@obengroup.com', 'jorgerestrepo@obengroup.com'],
        cc: ['ceo@paradixe.xyz', 'joseguzman@obengroup.com'],
      });

      expect(distributionLists.resolveRecipients).not.toHaveBeenCalled();
      const [email] = sendCalls(hub);
      expect(email[2].to).toBe('jorgerestrepo@obengroup.com');
      expect(email[2].cc).toBe('joseguzman@obengroup.com,ceo@paradixe.xyz');
      expect(res).toMatchObject({ to: ['jorgerestrepo@obengroup.com'], cc: ['joseguzman@obengroup.com', 'ceo@paradixe.xyz'] });
    });

    it('una lista vacía cuenta como "no indicados": usa la lista de distribución', async () => {
      const { service, hub } = makeService({ hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK }, distribution: COMEX });
      await service.send(10758, {}, false, { to: ['  '] });
      expect(sendCalls(hub)[0][2].to).toBe('comex@oben.com');
    });

    it('destinatarios() expone la lista "facturacion" para precargar la pantalla', async () => {
      const { service } = makeService({ distribution: { to: ['a@oben.com'], cc: ['b@oben.com'], bcc: ['oculto@oben.com'] } });
      expect(await service.destinatarios()).toEqual({ to: ['a@oben.com'], cc: ['b@oben.com'] });
    });
  });

  describe('historial y órdenes recientes', () => {
    it('historial: envíos (el más reciente primero, incluidos los fallidos) y la factura vigente', async () => {
      const { service } = makeService({
        auditEvents: [
          { action: 'facturacion_enviada', createdAt: new Date('2026-09-30T10:00:00Z'), reason: 'smtp down', outputData: { to: 'a@oben.com', cc: [], ok: false, cufe: 'c1', cufeSimulado: true } },
          { action: 'facturacion_dian_emitida', createdAt: new Date('2026-09-30T10:00:00Z'), outputData: { invoiceNumber: 'OV1', cufe: 'c1', status: 'ACEPTADA', simulated: true } },
          { action: 'facturacion_enviada', createdAt: new Date('2026-09-30T11:00:00Z'), outputData: { to: 'a@oben.com', cc: ['b@oben.com'], ok: true, cufe: 'c1', cufeSimulado: true } },
        ],
      });

      const h = await service.historial(1);

      expect(h.envios).toEqual([
        { fecha: '2026-09-30T11:00:00.000Z', to: ['a@oben.com'], cc: ['b@oben.com'], ok: true, cufe: 'c1', cufeSimulado: true, error: null },
        { fecha: '2026-09-30T10:00:00.000Z', to: ['a@oben.com'], cc: [], ok: false, cufe: 'c1', cufeSimulado: true, error: 'smtp down' },
      ]);
      expect(h.facturaElectronica).toMatchObject({ cufe: 'c1', simulated: true });
    });

    it('órdenes recientes: sin repetidos, sin envíos fallidos, la más reciente primero', async () => {
      const at = (h: string) => new Date(`2026-09-30T${h}:00:00Z`);
      const { service, audit } = makeService({
        actionEvents: [
          { entityId: '11147', createdAt: at('12'), outputData: { cliente: 'OBEN DISTRIBUIDORA COLOMBIA LTDA', ok: true } },
          { entityId: '11200', createdAt: at('11'), outputData: { cliente: 'FALLIDA', ok: false } },
          { entityId: '11147', createdAt: at('10'), outputData: { cliente: 'OBEN DISTRIBUIDORA COLOMBIA LTDA', ok: true } },
          { entityId: '10983', createdAt: at('09'), outputData: { cliente: 'OBEN US, LLC' } },
          { entityId: 'basura', createdAt: at('08'), outputData: {} },
        ],
      });

      expect(await service.ordenesRecientes()).toEqual([
        { numberOrderSales: 11147, cliente: 'OBEN DISTRIBUIDORA COLOMBIA LTDA', fecha: '2026-09-30T12:00:00.000Z' },
        { numberOrderSales: 10983, cliente: 'OBEN US, LLC', fecha: '2026-09-30T09:00:00.000Z' },
      ]);
      expect(audit.listByAction).toHaveBeenCalledWith('ov_approved_lista_empaque_enviada', 200);
    });
  });
});
