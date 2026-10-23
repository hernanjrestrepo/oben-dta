import { Injectable, Logger } from '@nestjs/common';
import { LiquidacionCierreService } from '../liquidacion/liquidacion-cierre.service';
import type { LiquidacionDraft } from '../liquidacion/liquidacion.types';
import type { TrasAprobacionComex } from '../liquidacion/aprobacion-comex.token';
import { FacturasParcialesService } from './facturas-parciales.service';

/**
 * Lo que pasa cuando COMEX aprueba una liquidación de exportación (Hernán, 23-oct):
 *  1. Correo "Se realizó revisión de liquidación de COMEX" con la Proforma, la Lista de Empaque y la Liquidación.
 *  2. Por separado, se pide la factura a Oben y Facturación recibe el aviso con el resultado, como hoy.
 * Lo llama el controlador de Liquidación al aprobar (token APROBACION_COMEX, en la misma petición).
 */
@Injectable()
export class AprobacionComexService implements TrasAprobacionComex {
  private readonly logger = new Logger(AprobacionComexService.name);

  constructor(
    private readonly cierre: LiquidacionCierreService,
    private readonly facturas: FacturasParcialesService,
  ) {}

  async procesar(draft: LiquidacionDraft, aprobacion: { por: string | null; huella: string }) {
    const pf = draft.numberPF;
    const correo = await this.cierre.enviarRevisionComex(draft, aprobacion).catch((err: Error) => ({ enviado: false, detalle: err.message }));
    this.logger.log(`PF ${pf}: correo de revisión de COMEX → ${correo.enviado ? 'enviado' : 'no salió'} (${correo.detalle}).`);
    const factura = await this.facturas.facturarExportacionAprobada(pf).catch((err: Error) => ({ estado: 'error', motivo: err.message }));
    this.logger.log(`PF ${pf}: factura al aprobar COMEX → ${factura.estado}${factura.motivo ? ` (${factura.motivo})` : ''}.`);
    return { correo, factura };
  }
}
