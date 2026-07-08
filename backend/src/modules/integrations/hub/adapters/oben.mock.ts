import { Inject, Injectable } from '@nestjs/common';
import { MockAdapterBase } from '../mock-adapter-base';
import { AdapterCapability } from '../adapter.types';
import { SCENARIO_PROVIDER, ScenarioProvider } from '../scenario.types';

/**
 * Oben legacy corporativo mock — sistema in-house tipo mainframe/ODS:
 *  - listar maestro de productos (SKU + estructura)
 *  - listar maestro de clientes
 *  - obtener existencia consolidada por SKU en bodegas
 *  - registrar movimiento de inventario (transferencia entre bodegas)
 */
@Injectable()
export class ObenMockAdapter extends MockAdapterBase {
  readonly system = 'oben';

  constructor(@Inject(SCENARIO_PROVIDER) scenarios: ScenarioProvider) {
    super({}, scenarios);
  }

  capabilities(): AdapterCapability[] {
    return [
      { operation: 'products.list', method: 'read', description: 'Maestro de productos Oben' },
      { operation: 'products.get', method: 'read', description: 'Detalle de producto por SKU' },
      { operation: 'customers.list', method: 'read', description: 'Maestro de clientes Oben' },
      { operation: 'inventory.stock', method: 'read', description: 'Existencias por SKU y bodega' },
      { operation: 'inventory.transfer', method: 'write', description: 'Transferir stock entre bodegas' },
    ];
  }

  protected operationHandlers() {
    return {
      'products.list': this.wrap((args) => this.productsList(args), 'products.list'),
      'products.get': this.wrap((args) => this.productsGet(args), 'products.get'),
      'customers.list': this.wrap((args) => this.customersList(args), 'customers.list'),
      'inventory.stock': this.wrap((args) => this.inventoryStock(args), 'inventory.stock'),
      'inventory.transfer': this.wrap((args) => this.inventoryTransfer(args), 'inventory.transfer'),
    };
  }

  private productsList(args: Record<string, unknown>) {
    const limit = Math.min(Number(args.limit ?? 20), 200);
    const items = Array.from({ length: Math.min(limit, 8) }, (_, i) => ({
      sku: `SKU-${(1000 + i).toString()}`,
      name: `Producto Oben ${i + 1}`,
      family: i % 2 === 0 ? 'Sellos hidráulicos' : 'Empaques industriales',
      unit: 'UND',
      price: 25000 + i * 3500,
    }));
    return { items, total: items.length };
  }

  private productsGet(args: Record<string, unknown>) {
    const sku = String(args.sku ?? '');
    if (!sku) throw new Error('BUSINESS_ERROR: sku requerido');
    return {
      sku,
      name: `Producto ${sku}`,
      family: 'Sellos hidráulicos',
      unit: 'UND',
      price: 25000,
      dimensions: { widthMm: 20, heightMm: 5, lengthMm: 20 },
      weightGr: 15,
    };
  }

  private customersList(args: Record<string, unknown>) {
    const limit = Math.min(Number(args.limit ?? 20), 200);
    const items = Array.from({ length: Math.min(limit, 6) }, (_, i) => ({
      clientId: `CL-${(2000 + i).toString()}`,
      name: `Cliente Oben ${i + 1}`,
      taxId: `901${100000 + i}`,
      creditLimit: 10_000_000 + i * 2_000_000,
    }));
    return { items, total: items.length };
  }

  private inventoryStock(args: Record<string, unknown>) {
    const sku = String(args.sku ?? '');
    if (!sku) throw new Error('BUSINESS_ERROR: sku requerido');
    return {
      sku,
      warehouses: [
        { code: 'BOD-01', name: 'Bodega principal', available: 320, reserved: 15 },
        { code: 'BOD-02', name: 'Bodega secundaria', available: 90, reserved: 5 },
        { code: 'BOD-03', name: 'Bodega de exportación', available: 40, reserved: 0 },
      ],
      totalAvailable: 450,
    };
  }

  private inventoryTransfer(args: Record<string, unknown>) {
    const sku = String(args.sku ?? '');
    const from = String(args.from ?? '');
    const to = String(args.to ?? '');
    const qty = Number(args.qty ?? 0);
    if (!sku || !from || !to) throw new Error('BUSINESS_ERROR: sku/from/to requeridos');
    if (qty <= 0) throw new Error('BUSINESS_ERROR: qty debe ser > 0');
    if (from === to) throw new Error('BUSINESS_ERROR: bodega origen y destino no pueden ser iguales');
    return {
      transferId: `MOV-${Date.now()}`,
      sku,
      from,
      to,
      qty,
      status: 'confirmed',
      confirmedAt: new Date().toISOString(),
    };
  }
}
