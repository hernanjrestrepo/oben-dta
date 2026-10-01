import { Injectable } from '@nestjs/common';
import type { FacturaElectronica, FacturacionDraft } from './facturacion.types';
import { construirFacturaDian, type DatosFacturaDian } from './factura-dian/representacion';
import { facturaDianPdf } from './factura-dian/factura-dian-pdf';

/**
 * PDF de facturación con el formato EXACTO de la factura electrónica de Oben
 * (representación gráfica de Facture / PL-Colab): FV para pedidos nacionales y
 * FEXP para exportación. Mientras no haya una factura electrónica real
 * emitida, el documento lleva marca de agua ("BORRADOR" / "SIMULADO") y el
 * CUFE se rotula como simulado — nunca pasa por un documento fiscal válido.
 */
@Injectable()
export class FacturacionPdfService {
  async buildFactura(datos: DatosFacturaDian): Promise<{ pdf: Buffer; avisos: string[] }> {
    const { factura, avisos } = construirFacturaDian(datos);
    return { pdf: await facturaDianPdf(factura), avisos };
  }

  async build(draft: FacturacionDraft, facturaElectronica: FacturaElectronica | null = null): Promise<Buffer> {
    return (await this.buildFactura({ draft, factura: facturaElectronica })).pdf;
  }
}
