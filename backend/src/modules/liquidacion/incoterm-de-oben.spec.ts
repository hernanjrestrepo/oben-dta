import { incotermDeProforma, parsearProformasComex } from './incoterm-de-oben';

// Formato REAL de spCheckSalesOrderComex_Paradixe (2026-10-01): objetos separados por comas, sin corchetes.
const REAL_SIN_INCOTERM =
  '{"NroProforma":"10842","Mercado":"EXPORTACION","Cliente":"TRUPAL S.A.","Pais":"PERU","OrdenesVenta":[{"NroOrdenVenta":"10932","DetalleSKU":[]}]},' +
  '{"NroProforma":"11366","Mercado":"EXPORTACION","Cliente":"OBEN US, LLC","Pais":"USA","OrdenesVenta":[{"NroOrdenVenta":"11187","DetalleSKU":[{"CodSec_SKU":347921,"SKU":"ENA--0012TM0902S0760","Cantidad":3526.36}]}]}';

describe('Incoterm desde el reporte de proformas de Oben (spCheckSalesOrderComex_Paradixe)', () => {
  it('lee el formato real "{...},{...}" (sin corchetes), un arreglo o un objeto', () => {
    expect(parsearProformasComex(REAL_SIN_INCOTERM).map((r) => r.NroProforma)).toEqual(['10842', '11366']);
    expect(parsearProformasComex([{ NroProforma: '1' }])).toHaveLength(1);
    expect(parsearProformasComex({ NroProforma: '1' })).toHaveLength(1);
    expect(parsearProformasComex('no es json')).toEqual([]);
  });

  it('hoy (sin el campo) devuelve null: nada se inventa', () => {
    expect(incotermDeProforma(REAL_SIN_INCOTERM, '11366')).toBeNull();
  });

  it.each([['Incoterm'], ['INCOTERM'], ['Incoterms'], ['TerminoNegociacion'], ['Termino_Negociacion']])(
    'cuando Oben agregue el campo "%s" en la proforma, se toma normalizado',
    (campo) => {
      const conCampo = REAL_SIN_INCOTERM.replace('"Pais":"USA"', `"Pais":"USA","${campo}":" dap "`);
      expect(incotermDeProforma(conCampo, '11366')).toBe('DAP');
    },
  );

  it('si viene por orden de venta y todas coinciden, se toma; si no coinciden, null', () => {
    const pf = (a: string, b: string) => [
      { NroProforma: '9', OrdenesVenta: [{ NroOrdenVenta: '1', Incoterm: a }, { NroOrdenVenta: '2', Incoterm: b }] },
    ];
    expect(incotermDeProforma(pf('CFR', 'cfr Callao'), '9')).toBe('CFR');
    expect(incotermDeProforma(pf('CFR', 'DAP'), '9')).toBeNull();
  });

  it('una PF que no está en el reporte → null', () => {
    expect(incotermDeProforma(REAL_SIN_INCOTERM, '99999')).toBeNull();
  });
});
