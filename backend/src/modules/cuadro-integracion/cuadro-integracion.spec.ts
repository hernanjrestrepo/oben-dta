import { calcularCuadroIntegracion } from './cuadro-integracion.calc';
import { CuadroIntegracionFuenteSimulada } from './cuadro-integracion.simulada';
import { CuadroIntegracionService } from './cuadro-integracion.service';
import type { CuadroIntegracionEntrada } from './cuadro-integracion.types';

async function cuadro() {
  const fuente = new CuadroIntegracionFuenteSimulada();
  const entrada = (await fuente.obtener('11187')) as CuadroIntegracionEntrada;
  return { fuente, entrada, c: calcularCuadroIntegracion(entrada, true) };
}

describe('Cuadro de integración (WO-033) — reproduce el certificado 51590 de Zona Franca', () => {
  it('las cantidades de materia prima coinciden con el certificado impreso', async () => {
    const { c } = await cuadro();
    const cant = (ref: string) => c.insumosExtranjeros.find((l) => l.referencia === ref)?.cantidad;
    expect(cant('69256-003')).toBe(5.49);
    expect(cant('78429-001')).toBe(332.87);
    expect(cant('66612-004')).toBe(30.79);
    expect(cant('70886-006')).toBe(55.46);
    expect(cant('81542-002')).toBe(3.8);
    expect(cant('80934-001')).toBe(2179.61); // tres lotes sumados
    expect(cant('80123-001')).toBe(11877.86);
    expect(cant('76030-001')).toBe(4019.74);
    expect(cant('80444-001')).toBe(4198.58);
    expect(cant('C-51392-002')).toBe(1545.93);
  });

  it('el % de desperdicio se calcula como lo imprime la Zona Franca (sobre valores redondeados)', async () => {
    const { c } = await cuadro();
    const l = (ref: string) => c.insumosExtranjeros.find((x) => x.referencia === ref)!;
    expect(l('69256-003').pctDesperdicio).toBeCloseTo(4.37158, 4);
    expect(l('78429-001').pctDesperdicio).toBeCloseTo(4.32902, 4);
    expect(l('80934-001').pctDesperdicio).toBeCloseTo(0.89695, 4);
  });

  it('desperdicios del proceso: copolímero, homopolímero y H3003 coinciden', async () => {
    const { c } = await cuadro();
    const d = (ref: string) => c.desperdicios.find((x) => x.referencia === ref)?.cantidad;
    expect(d('80934-001')).toBe(19.55);
    expect(d('80123-001')).toBe(514.19);
    expect(d('76030-001')).toBe(348.82);
    expect(d('70014-002')).toBe(11.898);
  });

  it('separa nacionales (6) y extranjeros (17) y la participación suma 100 %', async () => {
    const { c } = await cuadro();
    expect(c.insumosNacionales).toHaveLength(6);
    expect(c.insumosExtranjeros).toHaveLength(17);
    expect(c.totales.extranjerosUsd).toBeCloseTo(29814.1047, 0);
    expect(c.totales.nacionalesUsd).toBeCloseTo(873.864, 1);
    expect(c.totales.participacionExtranjeraPct).toBeCloseTo(51.8998, 1);
    expect(c.totales.participacionNacionalPct).toBeCloseTo(1.5212, 1);
    expect(c.totales.participacionOtrosPct).toBeCloseTo(46.579, 1);
    const suma = c.totales.participacionExtranjeraPct + c.totales.participacionNacionalPct + c.totales.participacionOtrosPct;
    expect(suma).toBeCloseTo(100, 1);
  });

  it('el consumo de materia prima cuadra con el producto elaborado y no hay avisos', async () => {
    const { c } = await cuadro();
    expect(c.balanceMasa.cuadra).toBe(true);
    expect(Math.abs(c.balanceMasa.diferenciaKg)).toBeLessThan(0.05);
    expect(c.avisos).toEqual([]);
    expect(c.simulado).toBe(true);
  });

  it('avisa lo que falta: referencia sin maestro, sin costo, sin conversión y masa que no cuadra', async () => {
    const { entrada } = await cuadro();
    const roto: CuadroIntegracionEntrada = {
      ...entrada,
      consumos: [...entrada.consumos, { referencia: 'XX-000', cantidad: 5 }, { referencia: '83015-003', cantidad: 10 }, { referencia: '80444-001', cantidad: 500 }],
      materiales: entrada.materiales.map((m) =>
        m.referencia === '83015-003' ? { ...m, kgPorUnidad: null, valorUnitUsd: null } : m,
      ),
    };
    const c = calcularCuadroIntegracion(roto, true);
    const texto = c.avisos.join(' | ');
    expect(texto).toContain('XX-000');
    expect(texto).toContain('conversión de U a kg');
    expect(texto).toContain('sin costo unitario');
    expect(c.balanceMasa.cuadra).toBe(false);
  });

  it('el servicio entrega el Excel y rechaza una orden vacía', async () => {
    const svc = new CuadroIntegracionService(new CuadroIntegracionFuenteSimulada());
    const buf = await svc.excel('11187');
    expect(buf.length).toBeGreaterThan(2000);
    await expect(svc.obtener(' ')).rejects.toThrow(/No hay datos/);
  });
});
