import { LiquidacionAvisoService } from './liquidacion-aviso.service';

function build(opts: { pais?: string; proforma?: string; listas?: Record<string, string[]>; draftError?: boolean; previos?: string[] } = {}) {
  const enviados: Array<Record<string, unknown>> = [];
  const hub = {
    call: jest.fn(async (system: string, op: string, args: Record<string, unknown>) => {
      if (op === 'query.run') return { ok: true, data: [{ Pais: opts.pais ?? 'BRASIL', Proforma: opts.proforma ?? '10867' }] };
      if (system === 'email' && op === 'send') {
        enviados.push(args);
        return { ok: true, data: { id: 'm1' } };
      }
      return { ok: false, error: 'op inesperada' };
    }),
  };
  const eventos: Array<{ action: string; reason?: string }> = (opts.previos ?? []).map((action) => ({ action }));
  const audit = {
    listForEntity: jest.fn(async () => eventos),
    log: jest.fn(async (e: { action: string; reason?: string }) => void eventos.push(e)),
  };
  const listas = opts.listas ?? { liquidacion_aprobacion: ['comex@obengroup.com', 'maria@obengroup.com'] };
  const distributionLists = {
    resolveRecipients: jest.fn(async (_t: string, key: string) => ({ to: listas[key] ?? [], cc: [], bcc: [] })),
  };
  const liquidacion = {
    getDraft: jest.fn(async () => {
      if (opts.draftError) throw new Error('Oben no respondió');
      return {
        numberPF: '10867',
        cliente: 'ERPLASTI',
        pais: 'BRASIL',
        incoterm: 'CFR',
        totales: { incoterm: 'CFR', flete: 752 },
        header: { paNcm: '39.20.10.90' },
        lines: [{ valueFOB: 55555.19, valueSure: 0 }],
        missing: [],
        ajustes: ['Partida arancelaria de Colombia (Parida del SKU, según Oben): 39.20.10.90.'],
        simulated: false,
        readyToSubmit: true,
      };
    }),
  };
  const ctx = { userId: null } as never;
  const svc = new LiquidacionAvisoService(hub as never, ctx, audit as never, distributionLists as never, liquidacion as never);
  return { svc, enviados, audit, liquidacion };
}

describe('LiquidacionAvisoService — exportación: liquidación lista para que COMEX la apruebe (José, 7-oct)', () => {
  it('exportación: arma la liquidación y avisa a COMEX con el resumen; no envía nada a Oben', async () => {
    const { svc, enviados } = build();
    const r = await svc.avisarExportacion(10758);
    expect(r).toEqual({ estado: 'avisada', numberPF: '10867' });
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({ to: 'comex@obengroup.com', cc: 'maria@obengroup.com' });
    expect(String(enviados[0].subject)).toBe('Liquidación para aprobar — PF 10867 / OV 10758 (ERPLASTI)');
    expect(String(enviados[0].body)).toContain('USD 55,555.19');
    expect(String(enviados[0].body)).toContain('solo falta la aprobación de COMEX');
  });

  it('un solo aviso por PF: la segunda vez se omite', async () => {
    const { svc, enviados } = build({ previos: ['liquidacion_aviso_comex'] });
    const r = await svc.avisarExportacion(10758);
    expect(r.estado).toBe('omitida');
    expect(enviados).toHaveLength(0);
  });

  it('pedido nacional: no lleva liquidación de exportación', async () => {
    const { svc, enviados, liquidacion } = build({ pais: 'COLOMBIA' });
    expect((await svc.avisarExportacion(11339)).estado).toBe('omitida');
    expect(enviados).toHaveLength(0);
    expect(liquidacion.getDraft).not.toHaveBeenCalled();
  });

  it('sin lista "liquidacion_aprobacion" usa la de cierre; sin ninguna, no envía y lo deja registrado', async () => {
    const conCierre = build({ listas: { liquidacion_cierre: ['facturacion@obengroup.com'] } });
    expect((await conCierre.svc.avisarExportacion(10758)).estado).toBe('avisada');
    expect(conCierre.enviados[0].to).toBe('facturacion@obengroup.com');

    const sinLista = build({ listas: {} });
    const r = await sinLista.svc.avisarExportacion(10758);
    expect(r.estado).toBe('omitida');
    expect(r.motivo).toContain('No hay lista de distribución');
    expect(sinLista.enviados).toHaveLength(0);
  });

  it('si la liquidación no se puede armar, igual avisa a COMEX con el motivo', async () => {
    const { svc, enviados } = build({ draftError: true });
    expect((await svc.avisarExportacion(10758)).estado).toBe('avisada');
    expect(String(enviados[0].body)).toContain('Oben no respondió');
  });
});
