import type { CasoLinea } from '../../entities/comercial-case.entity';
import { ComercialIntakeService } from './comercial-intake.service';
import { construirLinea } from './oc-extractor';

// Líneas tal como quedaron guardadas en producción (6-nov), leídas con los PDF adjuntos.
const guardada = (x: Partial<CasoLinea>): CasoLinea => ({
  n: 1, textoCliente: '', codigoCliente: null, codigoItem: null, codigoOben: null, equivalenciaId: null, cantidad: null, unidad: null,
  kilos: null, anchoMm: null, espesorMicras: null, precioUnitario: null, moneda: null, conversiones: [], faltantes: [], ...x,
});

function intake(equivalencias: Array<{ clientCode: string; obenCode: string }> = []) {
  const equivalences = { findAll: jest.fn(async () => equivalencias.map((e, i) => ({ id: `eq${i}`, ...e }))) };
  const maestros = { peliculas: jest.fn(async () => ['ET---0010RT', 'ET---0011TN', 'ET---0012TN', 'ET---0012RT', 'EMQ--0012MT']) };
  return new ComercialIntakeService({ call: jest.fn() } as never, {} as never, equivalences as never, maestros as never);
}

describe('"Volver a leer la orden" conserva las líneas ya leídas (6-nov)', () => {
  it('Agraf: 650 kg siguen siendo 650 (no 650.000) y toma la película de la equivalencia', async () => {
    const [l] = await intake([{ clientCode: 'PET L BTE TQ2 12MIC', obenCode: 'ET---0012RT' }]).reconstruirLineas(
      [guardada({ textoCliente: 'PET L BTE TQ2 12MIC 60CM', codigoCliente: 'PET L BTE TQ2 12MIC 60CM', cantidad: 650, unidad: 'kg', kilos: 650, anchoMm: 600, precioUnitario: 2.25, moneda: 'USD' })],
      'cli-agraf',
      { lineas: [guardada({ n: 1, anchoMm: 600, codigoItem: '0006931' })] },
    );
    expect(l).toMatchObject({ codigoOben: 'ET---0012RT', kilos: 650, anchoMm: 600, precioUnitario: 2.25, codigoItem: '0006931', faltantes: [] });
  });

  it('Bayshore: 48 ga. ET-TN → ET---0012TN; 1.257,3 mm → 1.258; 1,097 US$/lb → 2,4185 US$/kg', async () => {
    const t = '49-1/2" 48 ga. ET-TN - one side corona treated PET - 6" core - 30" OD - Corona Out';
    const [l] = await intake().reconstruirLineas(
      [guardada({ textoCliente: t, codigoCliente: t, cantidad: 43000, unidad: 'lb', kilos: 19504.472, anchoMm: 1257.3, precioUnitario: 1.097, moneda: 'USD' })],
      'cli-bayshore',
    );
    expect(l).toMatchObject({ codigoOben: 'ET---0012TN', kilos: 19504.48, anchoMm: 1258, faltantes: [] });
    expect(l.precioUnitario).toBeCloseTo(2.4185, 4);
  });

  it('OC 3019081 (triangulado): precio = Transfer Price, no el de la orden', async () => {
    const releida = guardada({ n: 1, anchoMm: 382.5, precioUnitario: 2.317, conversiones: ['precio de transferencia a OBEN US (cuerpo del correo): 2,317 US$/kg'] });
    const [l] = await intake().reconstruirLineas(
      [guardada({ textoCliente: '44 ga ET-TN-11', codigoCliente: '44 ga ET-TN-11', cantidad: 40000, unidad: 'lb', kilos: 18143.695, anchoMm: 971.55, precioUnitario: 1.1065, moneda: 'USD' })],
      'cli-obenus',
      { lineas: [releida], triangulado: true },
    );
    expect(l).toMatchObject({ codigoOben: 'ET---0011TN', kilos: 18143.7, anchoMm: 972, precioUnitario: 2.317, moneda: 'USD', faltantes: [] });
  });

  it('una Ref. Oben escrita a mano se respeta aunque no haya equivalencia', async () => {
    const [l] = await intake().reconstruirLineas([guardada({ textoCliente: 'XYZ raro', codigoCliente: 'XYZ raro', codigoOben: 'ET---0012RT', cantidad: 500, unidad: 'kg', kilos: 500, anchoMm: 700, precioUnitario: 2 })], 'c');
    expect(l).toMatchObject({ codigoOben: 'ET---0012RT', faltantes: [] });
  });
});

describe('protecciones del lector (6-nov)', () => {
  it('una línea de más de 30.000 kg queda como sospechosa (no se corrige sola)', () => {
    const l = construirLinea(1, { textoCliente: 'PET', cantidad: 650000, unidad: 'kg', ancho: 600, unidadAncho: 'mm' }, [{ id: 'e', clientCode: 'PET', obenCode: 'ET---0012RT' }]);
    expect(l.kilos).toBe(650000);
    expect(l.faltantes.join(' ')).toMatch(/cantidad sospechosa: 650\.000 kg/);
    expect(construirLinea(1, { textoCliente: 'PET', cantidad: 28000, unidad: 'kg', ancho: 600, unidadAncho: 'mm' }, [{ id: 'e', clientCode: 'PET', obenCode: 'X' }]).faltantes).toEqual([]);
  });

  it('en un pedido en libras, el ancho sin unidad está en pulgadas (38,25 → 972 mm, no 382,5)', () => {
    const l = construirLinea(1, { textoCliente: 'ET-TN-11', cantidad: 40000, unidad: 'lb', ancho: 38.25, unidadAncho: null }, [], ['ET---0011TN']);
    expect(l.anchoMm).toBe(972);
    // En kilos, un ancho sin unidad menor a 200 sigue siendo cm.
    expect(construirLinea(1, { textoCliente: 'BOPP', cantidad: 1000, unidad: 'kg', ancho: 60 }, []).anchoMm).toBe(600);
  });
});
