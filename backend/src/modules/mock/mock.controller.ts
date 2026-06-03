import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

// Datos mock realistas para demo de negocio
const PRODUCTS = [
  {
    sku: 'SKU-001',
    name: 'Tornillo hexagonal M8 x 50',
    stock: 100,
    committed: 20,
    price: 1000,
  },
  {
    sku: 'SKU-002',
    name: 'Tuerca autoblocante M8',
    stock: 50,
    committed: 10,
    price: 2000,
  },
];

const CLIENTS = [
  {
    clientId: 'CLIENT-001',
    name: 'Industrias del Norte S.A.S.',
    creditLimit: 100000,
    used: 40000,
  },
];

@UseGuards(JwtAuthGuard)
@Controller('mock')
export class MockController {
  @Get('inventory')
  getInventory() {
    return PRODUCTS.map((p) => ({
      sku: p.sku,
      name: p.name,
      stock: p.stock,
      committed: p.committed,
      available: p.stock - p.committed,
      price: p.price,
    }));
  }

  @Get('products/:sku')
  getProduct(@Param('sku') sku: string) {
    const product = PRODUCTS.find((p) => p.sku === sku);
    if (!product) return { found: false };
    return {
      found: true,
      sku: product.sku,
      name: product.name,
      stock: product.stock,
      committed: product.committed,
      available: product.stock - product.committed,
      price: product.price,
    };
  }

  @Get('credit/:clientId')
  getCredit(@Param('clientId') clientId: string) {
    const client = CLIENTS.find((c) => c.clientId === clientId) || CLIENTS[0];
    return {
      clientId: client.clientId,
      name: client.name,
      creditLimit: client.creditLimit,
      used: client.used,
      available: client.creditLimit - client.used,
    };
  }

  @Post('orders')
  createOrder(@Body() body: any) {
    return {
      orderId: 'ORD-' + Date.now(),
      status: body.status || 'CREATED',
      payload: body,
    };
  }

  @Post('invoice')
  createInvoice(@Body() body: any) {
    return {
      invoiceId: 'INV-' + Date.now(),
      status: 'APPROVED',
      dianStatus: 'ACCEPTED',
      payload: body,
    };
  }
}
