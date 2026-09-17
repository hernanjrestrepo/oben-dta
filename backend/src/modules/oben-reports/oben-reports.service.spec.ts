import { ObenReportsService } from './oben-reports.service';
import { ObenReportExcelService } from './oben-report-excel.service';

const SAMPLE = {
  Cliente: 'ETIQUETAS Y CAPSULAS DE COLOMBIA',
  OrdenVenta: '10794',
  Detalle: [{ Material: 'X', Cantidad: 5 }],
  Detalle1: [{ Pelicula: 'X', Detalle2: [{ Material: 'X', Cantidad: 5 }] }],
};

const PACKING_DATA = {
  Cliente: 'ETIQUETAS Y CAPSULAS DE COLOMBIA',
  DetailedPackingList: [{ PO: '1', CodigoBarraPallet: 'P1', Ancho: 480 }],
};

const LINEAS_DATA = [{ Linea: 1 }];
const COST_DATA = { Fecha: '2026-09-10', Cliente: 'ETIQUETAS Y CAPSULAS DE COLOMBIA', Detalle: [{ ConceptoPrincipal: 'X', CostoTotal: 10 }] };

/** Responde con los datos reales por procedimiento — evita que "un mock uniforme para todo" rompa lista_especial (array) / hoja_costos (dos pasos). */
function defaultHubCall(_system: string, op: string, args: any) {
  if (op === 'costOrder.get') return Promise.resolve({ ok: true, data: COST_DATA });
  if (args.procedure === 'spPackingListUSA_Paradixe') return Promise.resolve({ ok: true, data: PACKING_DATA });
  if (args.procedure === 'spChecLinea_Paradixe') return Promise.resolve({ ok: true, data: LINEAS_DATA });
  return Promise.resolve({ ok: true, data: SAMPLE });
}

function makeService(hubCall: jest.Mock, solefilmesPdf?: jest.Mock) {
  const hub = { call: hubCall } as any;
  const excel = new ObenReportExcelService();
  const solefilmes = { build: solefilmesPdf ?? jest.fn().mockResolvedValue(Buffer.from('%PDF-fake')) } as any;
  return { service: new ObenReportsService(hub, excel, solefilmes), solefilmes };
}

describe('ObenReportsService.buildDocumentPackage', () => {
  it('para un cliente que no es Solefilmes, arma 6 reportes (Lista Especial, 4 reportes y Hoja de Costos — sin check_settlement, chec_linea ni Solefilmes)', async () => {
    const hubCall = jest.fn().mockImplementation(defaultHubCall);
    const { service } = makeService(hubCall);

    const result = await service.buildDocumentPackage(10794);

    expect(result.included.map((r) => r.key)).toEqual([
      'lista_especial',
      'consumo_me',
      'consumo_mp',
      'empaque_unificada',
      'empaque_detallada',
      'hoja_costos_linea_1',
    ]);
    expect(result.failed).toEqual([]);
    expect(result.client).toBe('ETIQUETAS Y CAPSULAS DE COLOMBIA');
    expect(hubCall).not.toHaveBeenCalledWith('obenCostOrder', 'query.run', expect.objectContaining({ procedure: 'spCheckSettlement_Paradixe' }));
  });

  it('empaque_solefilmes se incluye en PDF solo cuando el cliente real de la orden es Solefilmes', async () => {
    const SOLE_DATA = { Customer: 'SOLEFILMES IMPORTACAO DISTRIBUICAO E LOGISTICA LTDA', Detalle1: [{ RollBarCode: 'x' }] };
    const hubCall = jest.fn().mockImplementation((system: string, op: string, args: any) => {
      if (args?.procedure === 'spEmpaqueSolefilmes_Paradixe') return Promise.resolve({ ok: true, data: SOLE_DATA });
      return defaultHubCall(system, op, args);
    });
    const solefilmesPdf = jest.fn().mockResolvedValue(Buffer.from('%PDF-fake'));
    const { service } = makeService(hubCall, solefilmesPdf);

    const result = await service.buildDocumentPackage(10794);

    expect(solefilmesPdf).toHaveBeenCalledWith(SOLE_DATA);
    const sole = result.included.find((r) => r.key === 'empaque_solefilmes');
    expect(sole).toBeDefined();
    expect(sole!.contentType).toBe('application/pdf');
  });

  it('un reporte que falla se informa sin bloquear a los demás', async () => {
    const hubCall = jest.fn().mockImplementation((system: string, op: string, args: any) => {
      if (args?.procedure === 'spEmpaqueDetallada_Paradixe') return Promise.resolve({ ok: false, error: 'no data' });
      return defaultHubCall(system, op, args);
    });
    const { service } = makeService(hubCall);

    const result = await service.buildDocumentPackage(10794);

    expect(result.included.map((r) => r.key)).not.toContain('empaque_detallada');
    expect(result.failed).toContainEqual({ key: 'empaque_detallada', label: 'Lista de Empaque Detallada', error: 'no data' });
  });

  it('si Oben responde OK pero sin tabla de datos, no se adjunta (encontrado en vivo con la OV 10952: spConsumoMP_Paradixe sin Detalle)', async () => {
    const CONSUMO_MP_SIN_DATOS = { Fecha: '2026-09-10', Cliente: 'OBEN DISTRIBUIDORA COLOMBIA LTDA', OrdenVenta: '10952' };
    const hubCall = jest.fn().mockImplementation((system: string, op: string, args: any) => {
      if (args?.procedure === 'spConsumoMP_Paradixe') return Promise.resolve({ ok: true, data: CONSUMO_MP_SIN_DATOS });
      return defaultHubCall(system, op, args);
    });
    const { service } = makeService(hubCall);

    const result = await service.buildDocumentPackage(10952);

    expect(result.included.map((r) => r.key)).not.toContain('consumo_mp');
    expect(result.failed).toContainEqual({
      key: 'consumo_mp',
      label: 'Consumo de Materia Prima',
      error: 'Oben no tiene datos de este reporte para esta orden.',
    });
  });

  it('Lista Especial: sin DetailedPackingList, se informa como fallido sin bloquear el resto', async () => {
    const hubCall = jest.fn().mockImplementation((system: string, op: string, args: any) => {
      if (args?.procedure === 'spPackingListUSA_Paradixe') return Promise.resolve({ ok: true, data: { Cliente: 'X' } });
      return defaultHubCall(system, op, args);
    });
    const { service } = makeService(hubCall);

    const result = await service.buildDocumentPackage(10794);

    expect(result.included.map((r) => r.key)).not.toContain('lista_especial');
    expect(result.failed).toContainEqual({
      key: 'lista_especial',
      label: 'Lista Especial',
      error: 'Oben no tiene datos de este reporte para esta orden.',
    });
  });

  it('Hoja de Costos: consulta spChecLinea_Paradixe y luego costOrder.get por cada línea', async () => {
    const hubCall = jest.fn().mockImplementation(defaultHubCall);
    const { service } = makeService(hubCall);

    await service.buildDocumentPackage(10794);

    expect(hubCall).toHaveBeenCalledWith('obenCostOrder', 'query.run', expect.objectContaining({ procedure: 'spChecLinea_Paradixe', numberOrderSales: 10794 }), expect.any(Object));
    expect(hubCall).toHaveBeenCalledWith('obenCostOrder', 'costOrder.get', { numberOrderSales: 10794, linea: 1 }, expect.any(Object));
  });

  it('Hoja de Costos: un documento POR LÍNEA (confirmado por José el 2026-09-17) — nunca consolidado', async () => {
    const LINEAS_MULTI = [{ Linea: 1 }, { Linea: 2 }];
    const hubCall = jest.fn().mockImplementation((system: string, op: string, args: any) => {
      if (args?.procedure === 'spChecLinea_Paradixe') return Promise.resolve({ ok: true, data: LINEAS_MULTI });
      if (op === 'costOrder.get') return Promise.resolve({ ok: true, data: { ...COST_DATA, Linea: args.linea } });
      return defaultHubCall(system, op, args);
    });
    const { service } = makeService(hubCall);

    const result = await service.buildDocumentPackage(10794);

    const hojaKeys = result.included.map((r) => r.key).filter((k) => k.startsWith('hoja_costos'));
    expect(hojaKeys).toEqual(['hoja_costos_linea_1', 'hoja_costos_linea_2']);
    const filenames = result.included.filter((r) => r.key.startsWith('hoja_costos')).map((r) => r.filename);
    expect(filenames).toEqual(['Hoja_de_Costos-OV10794-Linea1.xlsx', 'Hoja_de_Costos-OV10794-Linea2.xlsx']);
  });

  it('Hoja de Costos: sin líneas, se informa como fallido sin bloquear el resto', async () => {
    const hubCall = jest.fn().mockImplementation((system: string, op: string, args: any) => {
      if (args?.procedure === 'spChecLinea_Paradixe') return Promise.resolve({ ok: true, data: [] });
      return defaultHubCall(system, op, args);
    });
    const { service } = makeService(hubCall);

    const result = await service.buildDocumentPackage(10794);

    expect(result.included.map((r) => r.key)).not.toContain('hoja_costos');
    expect(result.failed).toContainEqual({
      key: 'hoja_costos',
      label: 'Hoja de Costos',
      error: 'Oben no tiene datos de este reporte para esta orden.',
    });
  });
});

describe('ObenReportsService.confirmApproveComex', () => {
  it('llama spApproveComex_Paradixe y devuelve ok cuando Oben responde bien', async () => {
    const hubCall = jest.fn().mockResolvedValue({ ok: true, data: 'OK' });
    const { service } = makeService(hubCall);

    const result = await service.confirmApproveComex(10794);

    expect(hubCall).toHaveBeenCalledWith('obenCostOrder', 'query.run', { procedure: 'spApproveComex_Paradixe', numberOrderSales: 10794 }, expect.any(Object));
    expect(result).toEqual({ ok: true, error: undefined, response: 'OK' });
  });

  it('si falla, no lanza — devuelve ok:false para que el llamador decida (best effort)', async () => {
    const hubCall = jest.fn().mockResolvedValue({ ok: false, error: 'boom' });
    const { service } = makeService(hubCall);

    const result = await service.confirmApproveComex(10794);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('boom');
  });

  it('si hub.call lanza una excepción, tampoco propaga', async () => {
    const hubCall = jest.fn().mockRejectedValue(new Error('network down'));
    const { service } = makeService(hubCall);

    const result = await service.confirmApproveComex(10794);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('network down');
  });
});
