import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { LiquidacionService } from '../liquidacion/liquidacion.service';
import { LiquidacionCierreService } from '../liquidacion/liquidacion-cierre.service';
import type { LiquidacionDraft } from '../liquidacion/liquidacion.types';
import { FacturasParcialesService } from './facturas-parciales.service';

/**
 * Lo que pasa cuando COMEX aprueba una liquidación de exportación (Hernán, 23-oct):
 *  1. Correo "Se realizó revisión de liquidación de COMEX" con la Proforma, la Lista de Empaque y la Liquidación.
 *  2. Por separado, se pide la factura a Oben y Facturación recibe el aviso con el resultado, como hoy.
 * Vive en Facturación (que ya depende de Liquidación) y se registra como oyente de la aprobación.
 */
@Injectable()
export class AprobacionComexService implements OnModuleInit {
  private readonly logger = new Logger(AprobacionComexService.name);

  constructor(
    private readonly liquidacion: LiquidacionService,
    private readonly cierre: LiquidacionCierreService,
    private readonly facturas: FacturasParcialesService,
  ) {}

  onModuleInit(): void {
    this.liquidacion.alAprobar((draft, aprobacion) => this.procesar(draft, aprobacion));
  }

  async procesar(draft: LiquidacionDraft, aprobacion: { por: string | null; huella: string }) {
    const pf = draft.numberPF;
    const correo = await this.cierre.enviarRevisionComex(draft, aprobacion).catch((err: Error) => ({ enviado: false, detalle: err.message }));
    this.logger.log(`PF ${pf}: correo de revisión de COMEX → ${correo.enviado ? 'enviado' : 'no salió'} (${correo.detalle}).`);
    const factura = await this.facturas.facturarExportacionAprobada(pf).catch((err: Error) => ({ estado: 'error', motivo: err.message }));
    this.logger.log(`PF ${pf}: factura al aprobar COMEX → ${factura.estado}${factura.motivo ? ` (${factura.motivo})` : ''}.`);
    return { correo, factura };
  }
}
