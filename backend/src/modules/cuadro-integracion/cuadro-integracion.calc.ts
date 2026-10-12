import type {
  ConsumoOrden,
  CuadroIntegracion,
  CuadroIntegracionEntrada,
  LineaDesperdicio,
  LineaInsumo,
  MaterialMaestro,
} from './cuadro-integracion.types';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;
/** Tolerancia del cuadre de masas: 0,1 % del producto (el Excel de Oben cuadra a la centésima de kg). */
const TOLERANCIA_MASA = 0.001;

/**
 * Fórmula verificada contra el certificado 51590 (Zona Franca, 23-sep-2026):
 * - MP (materia prima): desperdicio = consumo × %desp; regranulado = consumo × %reg;
 *   cantidad = consumo + desperdicio + regranulado (las 11 materias primas del certificado coinciden al centavo).
 * - ME (material de empaque): cantidad = consumo; el desperdicio se reporta aparte.
 * Pendiente de confirmar con Oben: la convención de los insumos nacionales (se trata como ME).
 */
export function calcularCuadroIntegracion(entrada: CuadroIntegracionEntrada, simulado: boolean): CuadroIntegracion {
  const avisos: string[] = [];
  const maestro = new Map<string, MaterialMaestro>(entrada.materiales.map((m) => [m.referencia, m]));

  const consumos = new Map<string, number>();
  for (const c of entrada.consumos as ConsumoOrden[]) consumos.set(c.referencia, (consumos.get(c.referencia) ?? 0) + c.cantidad);

  const nacionales: LineaInsumo[] = [];
  const extranjeros: LineaInsumo[] = [];
  const desperdicios: LineaDesperdicio[] = [];
  let consumoMpKg = 0;

  for (const [referencia, consumo] of consumos) {
    const m = maestro.get(referencia);
    if (!m) {
      avisos.push(`La referencia ${referencia} no está en el maestro de materiales: no entra al cuadro.`);
      continue;
    }
    const desperdicio = consumo * m.pctDesperdicio;
    const regranulado = m.tipo === 'MP' ? consumo * m.pctRegranulado : 0;
    const cantidad = m.tipo === 'MP' ? consumo + desperdicio + regranulado : consumo;
    const kgPorUnidad = m.unidad.toUpperCase() === 'KG' ? 1 : m.kgPorUnidad;
    if (kgPorUnidad === null) avisos.push(`${referencia} (${m.descripcion}): falta la conversión de ${m.unidad} a kg; el peso neto queda vacío.`);
    if (m.valorUnitUsd === null) avisos.push(`${referencia} (${m.descripcion}): sin costo unitario; el valor US$ queda vacío.`);
    if (m.origen === 'extranjero' && !m.declaracion && !/^(\d{5}-\d{3}|C-\d+-\d+)$/.test(m.referencia)) {
      avisos.push(`${referencia} (${m.descripcion}): insumo extranjero sin autorización de importación.`);
    }
    if (m.tipo === 'MP' && m.unidad.toUpperCase() === 'KG') consumoMpKg += consumo;

    const cantidadR = r2(cantidad);
    const desperdicioR = r2(desperdicio);
    const linea: LineaInsumo = {
      referencia,
      declaracion: m.declaracion,
      subpartida: m.subpartida,
      descripcion: m.descripcion,
      origen: m.origen,
      unidad: m.unidad,
      consumo: r4(consumo),
      desperdicio: desperdicioR,
      regranulado: r2(regranulado),
      cantidad: cantidadR,
      pesoNetoKg: kgPorUnidad === null ? null : r4(cantidadR * kgPorUnidad),
      valorUsd: m.valorUnitUsd === null ? null : r4(cantidadR * m.valorUnitUsd),
      pctDesperdicio: cantidadR > 0 ? r4((desperdicioR / cantidadR) * 100) : 0,
    };
    (m.origen === 'nacional' ? nacionales : extranjeros).push(linea);
    if (desperdicioR > 0) {
      desperdicios.push({
        referencia,
        descripcion: m.descripcion,
        unidad: m.unidad,
        // El certificado imprime el desperdicio de la MP a 2 decimales y el de los materiales de empaque a 3.
        cantidad: m.tipo === 'MP' ? desperdicioR : r4(desperdicio),
        pesoNetoKg: kgPorUnidad === null ? null : r4((m.tipo === 'MP' ? desperdicioR : desperdicio) * kgPorUnidad),
        valorUsd: m.valorUnitUsd === null ? null : r4((m.tipo === 'MP' ? desperdicioR : desperdicio) * m.valorUnitUsd),
      });
    }
  }

  const suma = (ls: { valorUsd: number | null }[]) => r4(ls.reduce((a, l) => a + (l.valorUsd ?? 0), 0));
  const productoKg = r4(entrada.productos.reduce((a, p) => a + p.cantidadKg, 0));
  const productoUsd = r4(entrada.productos.reduce((a, p) => a + p.valorUsd, 0));
  const nacionalesUsd = suma(nacionales);
  const extranjerosUsd = suma(extranjeros);
  const otrosUsd = r4(entrada.otrosCostos.reduce((a, o) => a + o.valorUsd, 0));
  const pct = (v: number) => (productoUsd > 0 ? r4((v / productoUsd) * 100) : 0);

  // Verificado con el certificado 51590: el consumo de MP (22.080,77 kg) = producto elaborado sin el recuperado (22.080,76 kg).
  const productoPrincipalKg = r4(
    entrada.productos.filter((p) => !/RECUPERADO/i.test(p.descripcion)).reduce((a, p) => a + p.cantidadKg, 0),
  );
  const diferenciaKg = r4(consumoMpKg - productoPrincipalKg);
  const cuadra = productoPrincipalKg > 0 && Math.abs(diferenciaKg) <= productoPrincipalKg * TOLERANCIA_MASA;
  if (!cuadra) {
    avisos.push(`El consumo de materia prima (${r2(consumoMpKg)} kg) no cuadra con el producto elaborado (${r2(productoPrincipalKg)} kg): diferencia ${r2(diferenciaKg)} kg.`);
  }

  const total = r4(nacionalesUsd + extranjerosUsd + otrosUsd);
  if (productoUsd > 0 && Math.abs(total - productoUsd) > productoUsd * 0.001) {
    avisos.push(`Los costos suman US$ ${r2(total)} y el producto vale US$ ${r2(productoUsd)}: el valor del producto no cuadra.`);
  }

  return {
    orden: entrada.orden,
    destino: entrada.destino,
    simulado,
    productos: entrada.productos,
    insumosNacionales: nacionales,
    insumosExtranjeros: extranjeros,
    desperdicios,
    otrosCostos: entrada.otrosCostos,
    totales: {
      productoKg,
      productoUsd,
      nacionalesUsd,
      extranjerosUsd,
      otrosUsd,
      desperdiciosKg: r4(desperdicios.reduce((a, d) => a + (d.pesoNetoKg ?? 0), 0)),
      participacionNacionalPct: pct(nacionalesUsd),
      participacionExtranjeraPct: pct(extranjerosUsd),
      participacionOtrosPct: pct(otrosUsd),
    },
    balanceMasa: { consumoMpKg: r4(consumoMpKg), productoKg: productoPrincipalKg, diferenciaKg, cuadra },
    avisos,
  };
}
