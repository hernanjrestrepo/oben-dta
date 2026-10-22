import { fechaDeExcel, filasDelDia } from './cuadro-diario';

const ENC = ['Status OV', 'OV', 'Cliente', 'Proforma', 'Transporte', 'F.Requerida', 'Comentarios', 'Films_name', 'Mes_Factura', 'OV Facturada', 'Total KG', 'Status Cartera', 'Comentarios Adicionales', 'Facturar', 'Dia Factura', 'Despacho hoy'];
const fila = (status: string, ov: number, cliente: string, pf: number, facturada: string, kg: number, facturar: string, dia: string | number) => [
  status, ov, cliente, pf, '', '', '', '', 'OCTUBRE', facturada, kg, '', '', facturar, dia, '',
];
const ARRIBA = [['', 'RESUMEN DIA', 46317], ['', 'FACTURAR', 153415], ENC];

describe('cuadro del día desde la hoja MES ACTUAL (Excel de Oben)', () => {
  it('serial de Excel a fecha (46317 = 2026-10-22)', () => {
    expect(fechaDeExcel(46317)).toBe('2026-10-22');
    expect(fechaDeExcel('2026-10-21')).toBe('2026-10-21');
    expect(fechaDeExcel('')).toBeNull();
  });

  it('toma solo el día pedido; saldo o despacho parcial = parcial; el resto completa', () => {
    const m = [
      ...ARRIBA,
      fila('CERRADA', 11402, 'POLIEMPAK SAS', 11597, 'No', 12330, 'Facturar', '2026-10-21'),
      fila('SALDO PENDIENTE', 11246, 'KP EMPAQUES FLEXIBLES S.A.S', 11435, 'No', 15069, 'Facturar', 46316),
      fila('DESPACHO PARCIAL', 11197, 'GILPA IMPRESORES S.A.', 11387, 'No', 4506, 'Facturar', '2026-10-21'),
      fila('CERRADA', 11334, 'PLASTICARIBE', 11532, 'No', 26944, 'Facturar', '2026-10-22'),
    ];
    const { filas, encabezadoEnFila } = filasDelDia(m, '2026-10-21');
    expect(encabezadoEnFila).toBe(3);
    expect(filas.map((f) => [f.ov, f.pf, f.tipo, f.incluida])).toEqual([
      [11402, '11597', 'completa', true],
      [11246, '11435', 'parcial', true],
      [11197, '11387', 'parcial', true],
    ]);
  });

  it('excluye con motivo: "Espera Complemento", ya facturada (Si) y la lista "no facturar"', () => {
    const m = [
      ...ARRIBA,
      fila('CERRADA', 1, 'A', 11001, 'No', 10, 'Espera Complemento', '2026-10-21'),
      fila('CERRADA', 2, 'B', 11002, 'Si', 10, 'Facturar', '2026-10-21'),
      fila('CERRADA', 11227, 'C', 11398, 'No', 10, 'Facturar', '2026-10-21'),
      fila('CERRADA', 4, 'D', 11004, 'No', 10, 'Facturar', '2026-10-21'),
    ];
    const { filas } = filasDelDia(m, '2026-10-21', [11227]);
    expect(filas.map((f) => [f.ov, f.incluida])).toEqual([[1, false], [2, false], [11227, false], [4, true]]);
    expect(filas[0].motivo).toMatch(/Espera Complemento/);
    expect(filas[1].motivo).toMatch(/ya la marca como facturada/);
    expect(filas[2].motivo).toMatch(/no facturar/);
  });

  it('una OV repetida el mismo día cuenta una sola vez; sin encabezado o sin columnas avisa claro', () => {
    const f = fila('CERRADA', 5, 'E', 11005, 'No', 10, 'Facturar', '2026-10-21');
    expect(filasDelDia([...ARRIBA, f, f], '2026-10-21').filas).toHaveLength(1);
    expect(() => filasDelDia([['x']], '2026-10-21')).toThrow(/Status OV/);
    expect(() => filasDelDia([['Status OV', 'OV']], '2026-10-21')).toThrow(/faltan columnas/);
  });
});
