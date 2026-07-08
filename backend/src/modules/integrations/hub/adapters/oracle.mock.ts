import { Inject, Injectable } from '@nestjs/common';
import { MockAdapterBase } from '../mock-adapter-base';
import { AdapterCallContext, AdapterCapability } from '../adapter.types';
import { SCENARIO_PROVIDER, ScenarioProvider } from '../scenario.types';

/**
 * Oracle ERP mock — simula el sub-conjunto que un ERP típico expone al SaaS:
 *   - GL: cuentas contables y asientos
 *   - AR: cuentas por cobrar (clientes)
 *   - AP: cuentas por pagar (proveedores)
 *
 * Los datos devueltos son deterministas por operación pero variables por args:
 * no se persisten, cada llamada genera respuesta coherente para pruebas E2E.
 */
@Injectable()
export class OracleMockAdapter extends MockAdapterBase {
  readonly system = 'oracle';

  constructor(@Inject(SCENARIO_PROVIDER) scenarios: ScenarioProvider) {
    super({}, scenarios);
  }

  capabilities(): AdapterCapability[] {
    return [
      { operation: 'gl.getAccounts', method: 'read', description: 'Catálogo de cuentas del libro mayor' },
      { operation: 'gl.postJournal', method: 'write', description: 'Registrar asiento contable' },
      { operation: 'ar.getCustomers', method: 'read', description: 'Cuentas por cobrar — clientes' },
      { operation: 'ap.getSuppliers', method: 'read', description: 'Cuentas por pagar — proveedores' },
      { operation: 'ap.postInvoice', method: 'write', description: 'Registrar factura de proveedor' },
    ];
  }

  protected operationHandlers() {
    return {
      'gl.getAccounts': this.wrap(async () => this.glAccounts(), 'gl.getAccounts'),
      'gl.postJournal': this.wrap(async (args) => this.glPostJournal(args), 'gl.postJournal'),
      'ar.getCustomers': this.wrap(async (args) => this.arCustomers(args), 'ar.getCustomers'),
      'ap.getSuppliers': this.wrap(async (args) => this.apSuppliers(args), 'ap.getSuppliers'),
      'ap.postInvoice': this.wrap(async (args) => this.apPostInvoice(args), 'ap.postInvoice'),
    };
  }

  private glAccounts() {
    return {
      accounts: [
        { code: '1105', name: 'Caja', type: 'ACTIVO' },
        { code: '1110', name: 'Bancos', type: 'ACTIVO' },
        { code: '1305', name: 'Clientes', type: 'ACTIVO' },
        { code: '2205', name: 'Proveedores', type: 'PASIVO' },
        { code: '4135', name: 'Ingresos por ventas', type: 'INGRESO' },
        { code: '5205', name: 'Gastos de personal', type: 'GASTO' },
        { code: '6135', name: 'Costo de ventas', type: 'COSTO' },
      ],
      totalRows: 7,
    };
  }

  private glPostJournal(args: Record<string, unknown>) {
    const lines = (args.lines as Array<{ account: string; debit?: number; credit?: number }>) ?? [];
    const debit = lines.reduce((s, l) => s + Number(l.debit ?? 0), 0);
    const credit = lines.reduce((s, l) => s + Number(l.credit ?? 0), 0);
    if (Math.abs(debit - credit) > 0.001) {
      throw new Error('BUSINESS_ERROR: asiento no balanceado');
    }
    return {
      journalId: `JRN-${Date.now()}`,
      status: 'posted',
      debit,
      credit,
      postedAt: new Date().toISOString(),
    };
  }

  private arCustomers(args: Record<string, unknown>) {
    const limit = Math.min(Number(args.limit ?? 20), 200);
    const customers = Array.from({ length: Math.min(limit, 5) }, (_, i) => ({
      id: `CUS-${1000 + i}`,
      name: `Cliente Oracle Demo ${i + 1}`,
      taxId: `900${100000 + i}`,
      balance: 1000000 + i * 250000,
      currency: 'COP',
    }));
    return { customers, total: customers.length };
  }

  private apSuppliers(args: Record<string, unknown>) {
    const limit = Math.min(Number(args.limit ?? 20), 200);
    const suppliers = Array.from({ length: Math.min(limit, 4) }, (_, i) => ({
      id: `SUP-${5000 + i}`,
      name: `Proveedor Oracle Demo ${i + 1}`,
      taxId: `800${200000 + i}`,
      terms: 'net30',
      currency: 'COP',
    }));
    return { suppliers, total: suppliers.length };
  }

  private apPostInvoice(args: Record<string, unknown>) {
    const supplierId = String(args.supplierId ?? '');
    const amount = Number(args.amount ?? 0);
    if (!supplierId) throw new Error('BUSINESS_ERROR: supplierId requerido');
    if (amount <= 0) throw new Error('BUSINESS_ERROR: amount debe ser > 0');
    return {
      invoiceId: `AP-${Date.now()}`,
      supplierId,
      amount,
      status: 'registered',
      registeredAt: new Date().toISOString(),
    };
  }
}
