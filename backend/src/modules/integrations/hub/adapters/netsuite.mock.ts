import { Inject, Injectable } from '@nestjs/common';
import { MockAdapterBase } from '../mock-adapter-base';
import { AdapterCapability } from '../adapter.types';
import { SCENARIO_PROVIDER, ScenarioProvider } from '../scenario.types';

/**
 * NetSuite mock — ERP sistema de registro de Oben (cuentas contables, asientos,
 * sincronización de clientes). Homólogo funcional de OracleMockAdapter pero
 * bajo el nombre real del sistema que usa Oben, para cuando lleguen las
 * credenciales reales (NETSUITE_ACCOUNT_ID / CONSUMER_KEY / TOKEN_ID en env).
 */
@Injectable()
export class NetSuiteMockAdapter extends MockAdapterBase {
  readonly system = 'netsuite';

  constructor(@Inject(SCENARIO_PROVIDER) scenarios: ScenarioProvider) {
    super({}, scenarios);
  }

  capabilities(): AdapterCapability[] {
    return [
      {
        operation: 'gl.getAccounts',
        method: 'read',
        description: 'Listar plan de cuentas contables',
      },
      {
        operation: 'gl.postJournal',
        method: 'write',
        description: 'Registrar asiento contable',
      },
      {
        operation: 'customer.sync',
        method: 'write',
        description: 'Sincronizar cliente hacia NetSuite',
      },
    ];
  }

  protected operationHandlers() {
    return {
      'gl.getAccounts': this.wrap(() => this.getAccounts(), 'gl.getAccounts'),
      'gl.postJournal': this.wrap(
        (args) => this.postJournal(args),
        'gl.postJournal',
      ),
      'customer.sync': this.wrap(
        (args) => this.customerSync(args),
        'customer.sync',
      ),
    };
  }

  private getAccounts() {
    return {
      accounts: [
        { code: '1100', name: 'Caja y bancos', type: 'ASSET' },
        { code: '1200', name: 'Cuentas por cobrar', type: 'ASSET' },
        { code: '4000', name: 'Ingresos por ventas', type: 'REVENUE' },
        { code: '5000', name: 'Costo de ventas', type: 'EXPENSE' },
      ],
    };
  }

  private postJournal(args: Record<string, unknown>) {
    const lines = args.lines as
      | Array<{ account: string; debit?: number; credit?: number }>
      | undefined;
    if (!lines || lines.length === 0)
      throw new Error('BUSINESS_ERROR: el asiento requiere al menos una línea');
    const debit = lines.reduce((sum, l) => sum + (l.debit ?? 0), 0);
    const credit = lines.reduce((sum, l) => sum + (l.credit ?? 0), 0);
    if (Math.round(debit * 100) !== Math.round(credit * 100)) {
      throw new Error('BUSINESS_ERROR: asiento no balanceado');
    }
    return {
      journalId: `NS-JE-${Date.now()}`,
      status: 'POSTED',
      lines,
      postedAt: new Date().toISOString(),
    };
  }

  private customerSync(args: Record<string, unknown>) {
    const clientId = String(args.clientId ?? '');
    if (!clientId) throw new Error('BUSINESS_ERROR: clientId requerido');
    return {
      netsuiteCustomerId: `NS-CUST-${clientId}`,
      clientId,
      status: 'SYNCED',
      syncedAt: new Date().toISOString(),
    };
  }
}
