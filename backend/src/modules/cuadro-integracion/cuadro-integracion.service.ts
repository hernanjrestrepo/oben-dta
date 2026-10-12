import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { calcularCuadroIntegracion } from './cuadro-integracion.calc';
import { CUADRO_INTEGRACION_FUENTE, type CuadroIntegracion, type CuadroIntegracionFuente, type LineaInsumo } from './cuadro-integracion.types';

@Injectable()
export class CuadroIntegracionService {
  constructor(@Inject(CUADRO_INTEGRACION_FUENTE) private readonly fuente: CuadroIntegracionFuente) {}

  async obtener(orden: string): Promise<CuadroIntegracion> {
    const entrada = await this.fuente.obtener(orden);
    if (!entrada) throw new NotFoundException(`No hay datos de consumo para la orden ${orden}.`);
    return calcularCuadroIntegracion(entrada, this.fuente.simulada);
  }

  /** Mismas hojas que el Excel que usan hoy: cuadro de integración, desperdicios y resumen. Solo lectura. */
  async excel(orden: string): Promise<Buffer> {
    const c = await this.obtener(orden);
    const wb = new ExcelJS.Workbook();
    const hoja = wb.addWorksheet('CUADRO INTEGRACION');
    hoja.addRow(['Origen', 'Referencia', 'Declaración', 'Subpartida', 'Descripción', 'Unidad', 'Cantidad', 'Peso neto kg', 'Valor US$', '% Desperdicio']);
    const fila = (l: LineaInsumo) =>
      hoja.addRow([l.origen, l.referencia, l.declaracion ?? '', l.subpartida ?? '', l.descripcion, l.unidad, l.cantidad, l.pesoNetoKg ?? '', l.valorUsd ?? '', l.pctDesperdicio]);
    c.insumosExtranjeros.forEach(fila);
    c.insumosNacionales.forEach(fila);
    hoja.getRow(1).font = { bold: true };

    const desp = wb.addWorksheet('DESPERDICIOS');
    desp.addRow(['Referencia', 'Descripción', 'Unidad', 'Cantidad', 'Peso neto kg', 'Valor US$']);
    c.desperdicios.forEach((d) => desp.addRow([d.referencia, d.descripcion, d.unidad, d.cantidad, d.pesoNetoKg ?? '', d.valorUsd ?? '']));
    desp.getRow(1).font = { bold: true };

    const res = wb.addWorksheet('RESUMEN');
    res.addRow(['Orden', c.orden]);
    res.addRow(['Destino', c.destino]);
    res.addRow(['Datos', c.simulado ? 'SIMULADOS: no provienen del ERP de Oben' : 'ERP de Oben']);
    res.addRow(['Producto elaborado kg', c.totales.productoKg]);
    res.addRow(['Producto elaborado US$', c.totales.productoUsd]);
    res.addRow(['Insumos nacionales US$', c.totales.nacionalesUsd, c.totales.participacionNacionalPct]);
    res.addRow(['Insumos extranjeros US$', c.totales.extranjerosUsd, c.totales.participacionExtranjeraPct]);
    res.addRow(['Otros costos US$', c.totales.otrosUsd, c.totales.participacionOtrosPct]);
    res.addRow(['Cuadre de masas', c.balanceMasa.cuadra ? 'Cuadra' : `No cuadra (${c.balanceMasa.diferenciaKg} kg)`]);
    c.avisos.forEach((a) => res.addRow(['Aviso', a]));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
