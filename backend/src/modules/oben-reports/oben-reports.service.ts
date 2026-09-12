import { Injectable, Logger } from '@nestjs/common';
import { IntegrationHubService } from '../integrations/hub/integration-hub.service';
import { ObenReportExcelService } from './oben-report-excel.service';
import { SolefilmesPdfService } from './solefilmes-pdf.service';
import { OBEN_REPORTS } from './oben-report-registry';

export interface PackageAttachment {
  key: string;
  label: string;
  filename: string;
  contentType: string;
  buffer: Buffer;
}

export interface PackageFailure {
  key: string;
  label: string;
  error: string;
}

export interface DocumentPackageResult {
  client: string;
  included: PackageAttachment[];
  failed: PackageFailure[];
}

/**
 * check_settlement y chec_linea NUNCA van sueltos en el "conjunto de
 * documentos": check_settlement pertenece al proceso de Liquidación, aparte
 * (José, demo 2026-09-08); chec_linea nunca se manda como documento propio
 * (Jorge Restrepo, 2026-09-09) — es solo el insumo para saber qué líneas
 * tiene la Hoja de Costos (ver buildHojaCostos), confirmado por José el
 * 2026-09-10.
 */
const EXCLUDED_FROM_PACKAGE = new Set(['check_settlement', 'chec_linea']);
const DOCUMENT_PACKAGE_REPORTS = OBEN_REPORTS.filter((r) => !EXCLUDED_FROM_PACKAGE.has(r.key));

/**
 * El default de ResilientAdapterExecutor (10s, 3 intentos) no sirve para las
 * consultas reales a Oben: encontrado en vivo el 2026-09-12, Consumo de
 * Material de Empaque llegó marcado como "timeout ... tras 10000ms" en
 * órdenes que sí tenían datos. Peor aún: como el timeout del executor es una
 * carrera (Promise.race) que NO cancela el fetch real en curso, cada
 * reintento automático lanza una llamada real nueva mientras la anterior
 * sigue viva de fondo — contra una API que "no soporta llamados
 * concurrentes" (ver comentario en buildDocumentPackage), eso apila tráfico
 * concurrente y empeora la lentitud en vez de mitigarla. Por eso aquí se usa
 * maxAttempts:1 (nada de reintentos automáticos) con un timeout más realista.
 */
export const OBEN_QUERY_OPTIONS = { maxAttempts: 1, timeoutMs: 30_000 };

/**
 * Campo que trae la tabla de cada reporte — si Oben responde 200 pero sin
 * este campo (o vacío), no hay nada que mostrar. Encontrado en vivo el
 * 2026-09-10: la OV 10952 no tiene consumo de materia prima registrado, y
 * spConsumoMP_Paradixe devuelve solo {Fecha,Cliente,OrdenVenta} sin
 * `Detalle` — ni error HTTP ni excepción, así que antes se adjuntaba un
 * .xlsx casi en blanco (con el encabezado duplicado) en vez de avisar que
 * ese reporte no tenía datos para esta orden.
 */
const TABLE_FIELD_BY_KEY: Record<string, string> = {
  consumo_me: 'Detalle1',
  consumo_mp: 'Detalle',
  empaque_unificada: 'Detalle',
  empaque_detallada: 'Detalle1',
  empaque_solefilmes: 'Detalle1',
};

function hasTableData(key: string, record: Record<string, unknown>): boolean {
  const field = TABLE_FIELD_BY_KEY[key];
  if (!field) return true; // reporte sin tabla conocida (ej. formato genérico futuro) — no se filtra a ciegas
  const value = record[field];
  return Array.isArray(value) && value.length > 0;
}

/**
 * Arma el "conjunto de documentos" real de una orden — usado tanto por el
 * endpoint manual (oben-reports/package/:n/send) como por el disparador
 * automático de correo (packing-list-automation): ambos deben mandar
 * EXACTAMENTE el mismo conjunto, porque el correo automático real de Oben
 * para una OV aprobada trae todos estos reportes juntos en un solo mensaje
 * (confirmado en vivo el 2026-09-09 contra un correo real de Oben para la
 * OV 10931) — nunca uno solo.
 */
@Injectable()
export class ObenReportsService {
  private readonly logger = new Logger(ObenReportsService.name);

  constructor(
    private readonly hub: IntegrationHubService,
    private readonly excel: ObenReportExcelService,
    private readonly solefilmesPdf: SolefilmesPdfService,
  ) {}

  async buildDocumentPackage(numberOrderSales: number): Promise<DocumentPackageResult> {
    const included: PackageAttachment[] = [];
    const failed: PackageFailure[] = [];
    let client = '';

    const listaEspecial = await this.buildListaEspecial(numberOrderSales);
    if (listaEspecial.ok) {
      included.push(listaEspecial.attachment);
      if (!client) client = listaEspecial.client;
    } else {
      failed.push(listaEspecial.failure);
    }

    // Secuencial a propósito (encontrado en vivo el 2026-09-09): la API real
    // de Oben (APIConsultaParadixe) no soporta llamados concurrentes — con
    // Promise.all, los reportes del paquete se pedían a la vez y casi todos
    // volvían "no se encuentras datos con los parámetros suministrados" pese
    // a que los mismos parámetros funcionan perfecto uno a la vez.
    for (const def of DOCUMENT_PACKAGE_REPORTS) {
      try {
        const data = await this.fetchReport(def.procedure, numberOrderSales);
        const record = data as Record<string, unknown>;
        if (!client) {
          const cliente = String(record.Cliente ?? record.Customer ?? '');
          if (cliente) client = cliente;
        }
        // Empaque Solefilmes trae datos reales (código de barras) para
        // CUALQUIER cliente que ya tenga rollos registrados — la API de Oben
        // no lo restringe — pero José confirmó que solo debe enviarse (en
        // PDF, formato "Shipment Traceability") cuando el cliente real de la
        // orden es Solefilmes. Para los demás, se omite del paquete (no
        // cuenta ni como incluido ni como fallido: simplemente no aplica).
        if (def.key === 'empaque_solefilmes') {
          const cliente = String(record.Customer ?? record.Cliente ?? '');
          if (!/solefilm/i.test(cliente)) continue;
          if (!hasTableData(def.key, record)) {
            failed.push({ key: def.key, label: def.label, error: 'Oben no tiene datos de este reporte para esta orden.' });
            continue;
          }
          const buffer = await this.solefilmesPdf.build(data as never);
          included.push({
            key: def.key,
            label: def.label,
            buffer,
            filename: `${def.label.replace(/\s+/g, '_')}-OV${numberOrderSales}.pdf`,
            contentType: 'application/pdf',
          });
        } else {
          if (!hasTableData(def.key, record)) {
            failed.push({ key: def.key, label: def.label, error: 'Oben no tiene datos de este reporte para esta orden.' });
            continue;
          }
          const buffer = await this.excel.build(def.label, numberOrderSales, data, def.format);
          included.push({
            key: def.key,
            label: def.label,
            buffer,
            filename: `${def.label.replace(/\s+/g, '_')}-OV${numberOrderSales}.xlsx`,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          });
        }
      } catch (err) {
        failed.push({ key: def.key, label: def.label, error: (err as Error).message });
      }
    }

    const hojaCostos = await this.buildHojaCostos(numberOrderSales);
    if (hojaCostos.ok) {
      included.push(hojaCostos.attachment);
    } else {
      failed.push(hojaCostos.failure);
    }

    return { client, included, failed };
  }

  /**
   * "Lista Especial" — confirmada por José el 2026-09-10 (documento de
   * APIs/SPs de Liquidación: spPackingListUSA_Paradixe "genera la Lista
   * Especial") y por Jorge Restrepo el mismo día ("esta lista es especial,
   * debe tener 3 hojas") — ver ObenReportExcelService.buildListaEspecial
   * para el detalle de las 3 hojas reales.
   */
  private async buildListaEspecial(
    numberOrderSales: number,
  ): Promise<{ ok: true; attachment: PackageAttachment; client: string } | { ok: false; failure: PackageFailure }> {
    const label = 'Lista Especial';
    try {
      const result = await this.hub.call('obenCostOrder', 'query.run', {
        procedure: 'spPackingListUSA_Paradixe',
        numberOrderSales,
      }, OBEN_QUERY_OPTIONS);
      if (!result.ok) {
        throw new Error(result.error ?? 'No se pudo consultar la lista de empaque en Oben');
      }
      const record = result.data as Record<string, unknown>;
      const client = String(record.Cliente ?? '');
      const lines = (record.DetailedPackingList as unknown[] | undefined) ?? [];
      if (lines.length === 0) {
        return { ok: false, failure: { key: 'lista_especial', label, error: 'Oben no tiene datos de este reporte para esta orden.' } };
      }
      const buffer = await this.excel.buildListaEspecial(numberOrderSales, record);
      return {
        ok: true,
        client,
        attachment: {
          key: 'lista_especial',
          label,
          buffer,
          filename: `Lista_Especial-OV${numberOrderSales}.xlsx`,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      };
    } catch (err) {
      return { ok: false, failure: { key: 'lista_especial', label, error: (err as Error).message } };
    }
  }

  /**
   * "Hoja de Costos" — confirmada por José el 2026-09-10: se consulta
   * spChecLinea_Paradixe(@NumberOV) para saber qué líneas tiene la orden, y
   * por cada línea, spCostOrder_Paradixe(@NumberOV,@Linea) vía
   * APICostOrderParadixe (operación `costOrder.get`, ya conectada desde una
   * sesión anterior). Se consolidan todas las líneas en un solo documento —
   * José no ha confirmado si prefiere un documento por línea; se eligió
   * consolidar para no fragmentar el correo en N adjuntos por una orden con
   * N líneas, ajustable si la respuesta de José indica lo contrario.
   */
  private async buildHojaCostos(
    numberOrderSales: number,
  ): Promise<{ ok: true; attachment: PackageAttachment } | { ok: false; failure: PackageFailure }> {
    const label = 'Hoja de Costos';
    try {
      const lineasResult = await this.hub.call('obenCostOrder', 'query.run', {
        procedure: 'spChecLinea_Paradixe',
        numberOrderSales,
      }, OBEN_QUERY_OPTIONS);
      if (!lineasResult.ok) {
        throw new Error(lineasResult.error ?? 'No se pudieron consultar las líneas de la orden en Oben');
      }
      const lineas = (lineasResult.data as Array<{ Linea: number }> | undefined) ?? [];
      if (lineas.length === 0) {
        return { ok: false, failure: { key: 'hoja_costos', label, error: 'Oben no tiene datos de este reporte para esta orden.' } };
      }

      const lineasConDatos: Array<{ linea: number; data: Record<string, unknown> }> = [];
      for (const l of lineas) {
        const costResult = await this.hub.call('obenCostOrder', 'costOrder.get', { numberOrderSales, linea: l.Linea }, OBEN_QUERY_OPTIONS);
        if (costResult.ok) {
          lineasConDatos.push({ linea: l.Linea, data: costResult.data as Record<string, unknown> });
        } else {
          this.logger.warn(`Orden ${numberOrderSales} línea ${l.Linea}: no se pudo consultar Hoja de Costos: ${costResult.error}`);
        }
      }
      if (lineasConDatos.length === 0) {
        return { ok: false, failure: { key: 'hoja_costos', label, error: 'Oben no tiene datos de este reporte para esta orden.' } };
      }

      const buffer = await this.excel.buildHojaCostos(numberOrderSales, lineasConDatos);
      return {
        ok: true,
        attachment: {
          key: 'hoja_costos',
          label,
          buffer,
          filename: `Hoja_de_Costos-OV${numberOrderSales}.xlsx`,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      };
    } catch (err) {
      return { ok: false, failure: { key: 'hoja_costos', label, error: (err as Error).message } };
    }
  }

  /**
   * Confirma ante Oben que ya se generaron los documentos de una orden
   * (spApproveComex_Paradixe) — nunca se había llamado en ningún envío hasta
   * hoy. "Best effort": si falla, se audita/loguea pero no bloquea el envío
   * del correo — lo prioritario es que los documentos lleguen; José todavía
   * no nos ha confirmado el comportamiento exacto esperado ante un fallo
   * (ver Preguntas y Requerimientos — Proceso de Liquidación, pregunta 5).
   */
  async confirmApproveComex(numberOrderSales: number): Promise<{ ok: boolean; error?: string; response?: unknown }> {
    try {
      const result = await this.hub.call('obenCostOrder', 'query.run', {
        procedure: 'spApproveComex_Paradixe',
        numberOrderSales,
      }, OBEN_QUERY_OPTIONS);
      if (!result.ok) {
        this.logger.warn(`Orden ${numberOrderSales}: no se pudo confirmar spApproveComex_Paradixe: ${result.error}`);
      }
      return { ok: result.ok, error: result.error, response: result.data };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.warn(`Orden ${numberOrderSales}: error confirmando spApproveComex_Paradixe: ${message}`);
      return { ok: false, error: message };
    }
  }

  private async fetchReport(procedure: string, numberOrderSales: number): Promise<unknown> {
    const result = await this.hub.call('obenCostOrder', 'query.run', { procedure, numberOrderSales }, OBEN_QUERY_OPTIONS);
    if (!result.ok) {
      throw new Error(result.error ?? 'No se pudo consultar el reporte en Oben');
    }
    return result.data;
  }
}
