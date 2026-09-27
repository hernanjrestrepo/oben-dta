import { BadRequestException, ConflictException } from '@nestjs/common';
import { FacturacionService } from './facturacion.service';

const TENANT_ID = 't1';

function makeService(overrides: {
  hubResponses?: Record<string, unknown>;
  auditEvents?: Array<{ action: string }>;
  distribution?: { to: string[]; cc: string[]; bcc: string[] };
  clientAddress?: string | null;
  pdfBuffer?: Buffer;
} = {}) {
  const hub = {
    call: jest.fn(async (_system: string, op: string, args: Record<string, unknown>) => {
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
  const clients = {
    findOne: jest.fn().mockResolvedValue(
      overrides.clientAddress !== undefined && overrides.clientAddress !== null
        ? { address: overrides.clientAddress }
        : null,
    ),
  } as any;
  const service = new FacturacionService(hub, ctx, audit, distributionLists, pdf, clients);
  return { service, hub, audit, distributionLists, pdf, clients };
}

const HEADER_EXPORT = { ok: true, data: { Cliente: 'OBEN US, LLC', Pais: 'USA', Proforma: '11271', Contenedor: 'CONT1', CodigoMaterial: 'SC15TN', OrdenCompra: '128353' } };
const HEADER_NACIONAL = { ok: true, data: { Cliente: 'CLIENTE NACIONAL SAS', Pais: 'COLOMBIA', Proforma: '10867' } };
const CHECK_OK = { ok: true, data: { Proforma: '11271', OrdenVenta: '11086', OrdenCompra: '128353', Cliente: 'OBEN US, LLC', Detalle: [{ CodSed_LineFilm: 113, TipoPelicula: 'ENA--0012TM', Precio: 2.827, KilosTotales: 1339.42 }] } };

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

  it('send lanza BadRequestException si no hay lista de distribución "facturacion" configurada', async () => {
    const { service } = makeService({ hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK } });
    await expect(service.send(10758)).rejects.toThrow(BadRequestException);
  });

  it('send bloquea un segundo envío accidental para la misma orden salvo force:true', async () => {
    const { service } = makeService({
      hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK },
      auditEvents: [{ action: 'facturacion_enviada' }],
      distribution: { to: ['comex@oben.com'], cc: [], bcc: [] },
    });

    await expect(service.send(10758)).rejects.toThrow(ConflictException);
  });

  it('send envía el correo con el PDF adjunto y audita el envío', async () => {
    const { service, hub, audit } = makeService({
      hubResponses: { header: HEADER_NACIONAL, check: CHECK_OK },
      distribution: { to: ['comex@oben.com'], cc: ['distribucion@oben.com'], bcc: [] },
    });

    const result = await service.send(10758);

    expect(result.sent).toBe(true);
    expect(result.to).toEqual(['comex@oben.com']);
    const sendCall = hub.call.mock.calls.find((c: unknown[]) => c[1] === 'send');
    expect(sendCall[2].attachments).toHaveLength(1);
    expect(sendCall[2].attachments[0].contentType).toBe('application/pdf');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'facturacion_enviada' }));
  });
});
