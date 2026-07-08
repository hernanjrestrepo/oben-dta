import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { MockAdapterBase } from '../mock-adapter-base';
import { AdapterCapability } from '../adapter.types';
import { SCENARIO_PROVIDER, ScenarioProvider } from '../scenario.types';

/**
 * DIAN mock — facturación electrónica Colombia.
 *  - envío de factura → devuelve CUFE + estado ACEPTADA por defecto
 *  - consulta de estado por CUFE
 *  - nota crédito
 *
 * El CUFE es determinista: SHA-256 sobre invoiceNumber+total+timestamp,
 * de modo que los tests puedan reproducirlo.
 */
@Injectable()
export class DianMockAdapter extends MockAdapterBase {
  readonly system = 'dian';

  constructor(@Inject(SCENARIO_PROVIDER) scenarios: ScenarioProvider) {
    super({}, scenarios);
  }

  capabilities(): AdapterCapability[] {
    return [
      {
        operation: 'invoice.send',
        method: 'write',
        description: 'Enviar factura electrónica a DIAN',
      },
      {
        operation: 'invoice.status',
        method: 'read',
        description: 'Consultar estado por CUFE',
      },
      {
        operation: 'creditNote.send',
        method: 'write',
        description: 'Enviar nota crédito',
      },
    ];
  }

  protected operationHandlers() {
    return {
      'invoice.send': this.wrap(
        (args) => this.invoiceSend(args),
        'invoice.send',
      ),
      'invoice.status': this.wrap(
        (args) => this.invoiceStatus(args),
        'invoice.status',
      ),
      'creditNote.send': this.wrap(
        (args) => this.creditNoteSend(args),
        'creditNote.send',
      ),
    };
  }

  private invoiceSend(args: Record<string, unknown>) {
    const invoiceNumber = String(args.invoiceNumber ?? '');
    const totalAmount = Number(args.totalAmount ?? 0);
    if (!invoiceNumber)
      throw new Error('BUSINESS_ERROR: invoiceNumber requerido');
    if (totalAmount <= 0) throw new Error('BUSINESS_ERROR: totalAmount > 0');
    const cufe = createHash('sha256')
      .update(
        `${invoiceNumber}|${totalAmount}|${new Date().toISOString().slice(0, 10)}`,
      )
      .digest('hex');
    return {
      invoiceNumber,
      cufe,
      status: 'ACEPTADA',
      dianReceivedAt: new Date().toISOString(),
      xmlUrl: `https://mock-dian.local/xml/${cufe.slice(0, 12)}.xml`,
      pdfUrl: `https://mock-dian.local/pdf/${cufe.slice(0, 12)}.pdf`,
    };
  }

  private invoiceStatus(args: Record<string, unknown>) {
    const cufe = String(args.cufe ?? '');
    if (!cufe) throw new Error('BUSINESS_ERROR: cufe requerido');
    return {
      cufe,
      status: 'ACEPTADA',
      lastCheckedAt: new Date().toISOString(),
    };
  }

  private creditNoteSend(args: Record<string, unknown>) {
    const invoiceCufe = String(args.invoiceCufe ?? '');
    const amount = Number(args.amount ?? 0);
    if (!invoiceCufe) throw new Error('BUSINESS_ERROR: invoiceCufe requerido');
    if (amount <= 0) throw new Error('BUSINESS_ERROR: amount > 0');
    const cufe = createHash('sha256')
      .update(`NC|${invoiceCufe}|${amount}|${Date.now()}`)
      .digest('hex');
    return {
      cufe,
      relatedInvoiceCufe: invoiceCufe,
      amount,
      status: 'ACEPTADA',
      receivedAt: new Date().toISOString(),
    };
  }
}
