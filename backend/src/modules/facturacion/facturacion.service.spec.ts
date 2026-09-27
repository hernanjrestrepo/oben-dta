import { BadRequestException, ConflictException } from '@nestjs/common';
import { FacturacionService } from './facturacion.service';

const TENANT_ID = 't1';

function makeService(overrides: {
  hubResponses?: Record<string, unknown>;
  auditEvents?: Array<{ action: string; outputData?: Record<string, unknown> | null }>;
  distribution?: { to: string[]; cc: string[]; bcc: string[] };
  clientAddress?: string | null;
  /** Filas del maestro de clientes que coinciden por nombre (tiene prioridad sobre clientAddress). */
  clientMatches?: Array<{ address: string | null }>;
  pdfBuffer?: Buffer;
} = {}) {
  const hub = {
    call: jest.fn(async (_system: string, op: string) => {
      if (op === 'query.run') {
        return overrides.hubResponses?.header ?? { ok: true, data: {} };
      }
      if (op === 'liquidacion.consultar') {
        return overrides.hubResponses?.check ?? { ok: true, data: {} };
      }
      if (op === 'send') {
        return overrides.hubResponses?.send ?? { ok: true, data: { id: 'msg-1' } };
      }
      return { ok: false, error: `op inesperada ${op}` };
    }),
  } as any;
  const ctx = { tenantId: TENANT_ID, userId: 'u1' } as any;
  const audit = {
    log: jest.fn().mockResolvedValue(undefined),
    listForEntity: jest.fn().mockResolvedValue(overrides.auditEvents ?? []),
  } as any;
  const distributionLists = {
    resolveRecipients: jest.fn().mockResolvedValue(overrides.distribution ?? { to: [], cc: [], bcc: [] }),
  } as any;
  const pdf = { build: jest.fn().mockResolvedValue(overrides.pdfBuffer ?? Buffer.from('pdf')) } as any;
  const matches =
    overrides.clientMatches ??
    (overrides.clientAddress !== undefined && overrides.clientAddress !== null ? [{ address: overrides.clientAddress }] : []);
  const clients = { find: jest.fn().mockResolvedValue(matches) } as any;
  const service = new FacturacionService(hub, ctx, audit, distributionLists, pdf, clients);
  return { service, hub, audit, distributionLists, pdf, clients };
}

const HEADER_EXPORT = { ok: true, data: { Cliente: 'OBEN US, LLC', Pais: 'USA', Proforma: '11271', Contenedor: 'CONT1', CodigoMaterial: 'SC15TN', OrdenCompra: '128353' } };
const HEADER_NACIONAL = { ok: true, data: { Cliente: 'CLIENTE NACIONAL SAS', Pais: 'COLOMBIA', Proforma: '10867' } };
const CHECK_OK = { ok: true, data: { Proforma: '11271', OrdenVenta: '11086', OrdenCompra: '128353', Cliente: 'OBEN US, LLC', Detalle: [{ CodSed_LineFilm: 113, TipoPelicula: 'ENA--0012TM', Precio: 2.827, KilosTotales: 1339.42 }] } };
const header = (data: Record<string, unknown>) => ({ ok: true, data: { Cliente: 'X SAS', Proforma: '10867', ...data } });
const sendCalls = (hub: { call: jest.Mock }) => hub.call.mock.calls.filter((c: unknown[]) => c[1] === 'send');

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
});
