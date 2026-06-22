import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../../entities/client.entity';
import { Product } from '../../entities/product.entity';
import { User, UserRole } from '../../entities/user.entity';
import { Order, OrderStatus } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { Quote, QuoteStatus } from '../../entities/quote.entity';
import { QuoteItem } from '../../entities/quote-item.entity';
import {
  ProductionOrder,
  ProductionOrderStatus,
  ProductionPriority,
} from '../../entities/production-order.entity';
import { Invoice, InvoiceStatus } from '../../entities/invoice.entity';
import {
  ExportOperation,
  ExportOperationStatus,
  ExportType,
} from '../../entities/export-operation.entity';
import {
  Shipment,
  ShipmentStatus,
  ShipmentType,
  CarrierType,
} from '../../entities/shipment.entity';
import { Incoterm, IncotermGroup } from '../../entities/incoterm.entity';
import {
  FreightQuote,
  FreightQuoteStatus,
  FreightType,
  FreightServiceLevel,
} from '../../entities/freight-quote.entity';
import {
  InsuranceQuote,
  InsuranceQuoteStatus,
  CoverageType,
  InsuranceType,
} from '../../entities/insurance-quote.entity';
import { ExportCostSheet } from '../../entities/export-cost-sheet.entity';
import {
  PackingList,
  PackingListStatus,
  PackingListType,
} from '../../entities/packing-list.entity';
import {
  MasterPackingList,
  MasterPackingListStatus,
  MasterPackingListType,
} from '../../entities/master-packing-list.entity';
import { CostSheetStatus } from '../../entities/export-cost-sheet.entity';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Quote)
    private quoteRepository: Repository<Quote>,
    @InjectRepository(QuoteItem)
    private quoteItemRepository: Repository<QuoteItem>,
    @InjectRepository(ProductionOrder)
    private productionOrderRepository: Repository<ProductionOrder>,
    @InjectRepository(Invoice)
    private invoiceRepository: Repository<Invoice>,
    @InjectRepository(ExportOperation)
    private exportOperationRepository: Repository<ExportOperation>,
    @InjectRepository(Shipment)
    private shipmentRepository: Repository<Shipment>,
    @InjectRepository(Incoterm)
    private incotermRepository: Repository<Incoterm>,
    @InjectRepository(FreightQuote)
    private freightQuoteRepository: Repository<FreightQuote>,
    @InjectRepository(InsuranceQuote)
    private insuranceQuoteRepository: Repository<InsuranceQuote>,
    @InjectRepository(ExportCostSheet)
    private exportCostSheetRepository: Repository<ExportCostSheet>,
    @InjectRepository(PackingList)
    private packingListRepository: Repository<PackingList>,
    @InjectRepository(MasterPackingList)
    private masterPackingListRepository: Repository<MasterPackingList>,
  ) {}

  async seed() {
    this.logger.log('Starting seed data generation...');

    try {
      // Clear existing data (in reverse order of dependencies)
      await this.clearData();

      // Seed data in proper order
      await this.seedIncoterms();
      await this.seedClients();
      await this.seedProducts();
      await this.seedUsers();
      await this.seedQuotes();
      await this.seedOrders();
      await this.seedProductionOrders();
      await this.seedInvoices();
      await this.seedExportOperations();
      await this.seedFreightQuotes();
      await this.seedInsuranceQuotes();
      await this.seedExportCostSheets();
      await this.seedMasterPackingLists();
      await this.seedPackingLists();
      await this.seedShipments();

      this.logger.log('Seed data generation completed successfully');
    } catch (error) {
      this.logger.error('Error during seed data generation', error.stack);
      throw error;
    }
  }

  private async clearData() {
    this.logger.log('Clearing existing data...');

    // Clear in reverse order of dependencies
    await this.shipmentRepository.query(
      'TRUNCATE shipments RESTART IDENTITY CASCADE',
    );
    await this.packingListRepository.query(
      'TRUNCATE packing_lists RESTART IDENTITY CASCADE',
    );
    await this.masterPackingListRepository.query(
      'TRUNCATE master_packing_lists RESTART IDENTITY CASCADE',
    );
    await this.exportCostSheetRepository.query(
      'TRUNCATE export_cost_sheets RESTART IDENTITY CASCADE',
    );
    await this.insuranceQuoteRepository.query(
      'TRUNCATE insurance_quotes RESTART IDENTITY CASCADE',
    );
    await this.freightQuoteRepository.query(
      'TRUNCATE freight_quotes RESTART IDENTITY CASCADE',
    );
    await this.exportOperationRepository.query(
      'TRUNCATE export_operations RESTART IDENTITY CASCADE',
    );
    await this.invoiceRepository.query(
      'TRUNCATE invoices RESTART IDENTITY CASCADE',
    );
    await this.productionOrderRepository.query(
      'TRUNCATE production_orders RESTART IDENTITY CASCADE',
    );
    await this.orderItemRepository.query(
      'TRUNCATE order_items RESTART IDENTITY CASCADE',
    );
    await this.orderRepository.query(
      'TRUNCATE orders RESTART IDENTITY CASCADE',
    );
    await this.quoteItemRepository.query(
      'TRUNCATE quote_items RESTART IDENTITY CASCADE',
    );
    await this.quoteRepository.query(
      'TRUNCATE quotes RESTART IDENTITY CASCADE',
    );
    await this.userRepository.query('TRUNCATE users RESTART IDENTITY CASCADE');
    await this.productRepository.query(
      'TRUNCATE products RESTART IDENTITY CASCADE',
    );
    await this.clientRepository.query(
      'TRUNCATE clients RESTART IDENTITY CASCADE',
    );
    await this.incotermRepository.query(
      'TRUNCATE incoterms RESTART IDENTITY CASCADE',
    );

    this.logger.log('Existing data cleared');
  }

  private async seedIncoterms() {
    this.logger.log('Seeding incoterms...');

    const incoterms = [
      {
        code: 'EXW',
        name: 'Ex Works',
        group: IncotermGroup.E,
        description:
          'Ex Works - Seller makes goods available at their premises',
        sellerResponsibilities: "Make goods available at seller's premises",
        buyerResponsibilities: "All costs and risks from seller's premises",
        usageGuidelines: 'Use when buyer has full control over logistics',
        isActive: true,
        sortOrder: 1,
        applicableRegions: 'Worldwide',
        typicalSellerCostPercentage: 5.0,
        riskTransferPoint: "Seller's premises",
        requiresInsurance: false,
        requiresFreightPayment: false,
        customsClearanceResponsibility: 'Buyer',
      },
      {
        code: 'FOB',
        name: 'Free On Board',
        group: IncotermGroup.F,
        description:
          'Free On Board - Seller delivers goods on board the vessel',
        sellerResponsibilities:
          'Deliver goods on board vessel at port of shipment',
        buyerResponsibilities: "All costs and risks from ship's rail",
        usageGuidelines: 'Use for sea and inland waterway transport',
        isActive: true,
        sortOrder: 2,
        applicableRegions: 'Maritime',
        typicalSellerCostPercentage: 25.0,
        riskTransferPoint: "Ship's rail at port of shipment",
        requiresInsurance: false,
        requiresFreightPayment: false,
        customsClearanceResponsibility: 'Seller (export), Buyer (import)',
      },
      {
        code: 'CIF',
        name: 'Cost, Insurance and Freight',
        group: IncotermGroup.C,
        description:
          'Cost, Insurance and Freight - Seller pays freight and insurance',
        sellerResponsibilities: 'Pay freight and insurance to destination port',
        buyerResponsibilities: "All costs and risks from ship's rail",
        usageGuidelines: 'Use for sea and inland waterway transport',
        isActive: true,
        sortOrder: 3,
        applicableRegions: 'Maritime',
        typicalSellerCostPercentage: 65.0,
        riskTransferPoint: "Ship's rail at port of shipment",
        requiresInsurance: true,
        requiresFreightPayment: true,
        customsClearanceResponsibility: 'Seller (export), Buyer (import)',
      },
      {
        code: 'DDP',
        name: 'Delivered Duty Paid',
        group: IncotermGroup.D,
        description: 'Delivered Duty Paid - Seller bears all costs and risks',
        sellerResponsibilities:
          "Deliver goods to buyer's premises, cleared for import",
        buyerResponsibilities: 'Receive goods at destination',
        usageGuidelines: 'Use when seller can handle import clearance',
        isActive: true,
        sortOrder: 4,
        applicableRegions: 'Worldwide',
        typicalSellerCostPercentage: 95.0,
        riskTransferPoint: "Buyer's premises",
        requiresInsurance: true,
        requiresFreightPayment: true,
        customsClearanceResponsibility: 'Seller',
      },
    ];

    for (const incotermData of incoterms) {
      const incoterm = this.incotermRepository.create(incotermData);
      await this.incotermRepository.save(incoterm);
    }

    this.logger.log('Incoterms seeded successfully');
  }

  private async seedClients() {
    this.logger.log('Seeding clients...');

    const clients = [
      {
        clientId: 'CLIENT-001',
        name: 'Industrias del Norte S.A.S.',
        email: 'contact@industriasdelnorte.com',
        phone: '+57 1 234 5678',
        address: 'Calle 100 # 15-20, Bogotá, Colombia',
        creditLimit: 1000000.0,
        usedCredit: 400000.0,
        isActive: true,
      },
      {
        clientId: 'CLIENT-002',
        name: 'Constructora Andina Ltda.',
        email: 'info@constructoraandina.com',
        phone: '+57 2 345 6789',
        address: 'Av. Las Palmas # 45-67, Medellín, Colombia',
        creditLimit: 750000.0,
        usedCredit: 200000.0,
        isActive: true,
      },
      {
        clientId: 'CLIENT-003',
        name: 'Exportadora del Caribe S.A.',
        email: 'exports@exportadoracaribe.com',
        phone: '+57 4 567 8901',
        address: 'Carrera 30 # 25-35, Cartagena, Colombia',
        creditLimit: 1500000.0,
        usedCredit: 600000.0,
        isActive: true,
      },
      {
        clientId: 'CLIENT-004',
        name: 'Distribuidora Internacional S.A.',
        email: 'ventas@distribuidorainternacional.com',
        phone: '+57 5 678 9012',
        address: 'Calle 80 # 12-45, Cali, Colombia',
        creditLimit: 2000000.0,
        usedCredit: 800000.0,
        isActive: true,
      },
      {
        clientId: 'CLIENT-005',
        name: 'Maquinaria Pesada del Sur S.A.',
        email: 'compras@maquinariapesada.com',
        phone: '+57 6 789 0123',
        address: 'Av. Principal # 55-78, Barranquilla, Colombia',
        creditLimit: 1200000.0,
        usedCredit: 300000.0,
        isActive: true,
      },
    ];

    for (const clientData of clients) {
      const client = this.clientRepository.create(clientData);
      await this.clientRepository.save(client);
    }

    this.logger.log('Clients seeded successfully');
  }

  private async seedProducts() {
    this.logger.log('Seeding products...');

    const products = [
      {
        sku: 'PROD-001',
        name: 'Tornillo hexagonal M8 x 50mm',
        description: 'Tornillo hexagonal de acero inoxidable M8 x 50mm',
        category: 'Hardware',
        unit: 'unidad',
        weight: 0.05,
        dimensions: '8mm x 50mm',
        unitPrice: 1200.0,
        currency: 'COP',
        stock: 5000,
        reserved: 1000,
        minStock: 1000,
        isActive: true,
        supplier: 'Herramientas Industriales S.A.',
        leadTime: 7,
      },
      {
        sku: 'PROD-002',
        name: 'Tuerca autoblocante M8',
        description: 'Tuerca autoblocante M8 de acero galvanizado',
        category: 'Hardware',
        unit: 'unidad',
        weight: 0.02,
        dimensions: 'M8',
        unitPrice: 2500.0,
        currency: 'COP',
        stock: 3000,
        reserved: 500,
        minStock: 500,
        isActive: true,
        supplier: 'Conectores y Tornillería Ltda.',
        leadTime: 5,
      },
      {
        sku: 'PROD-003',
        name: 'Arandela plana M8',
        description: 'Arandela plana M8 de acero zincado',
        category: 'Hardware',
        unit: 'unidad',
        weight: 0.005,
        dimensions: 'M8',
        unitPrice: 800.0,
        currency: 'COP',
        stock: 10000,
        reserved: 2000,
        minStock: 1000,
        isActive: true,
        supplier: 'Herramientas Industriales S.A.',
        leadTime: 3,
      },
      {
        sku: 'PROD-004',
        name: 'Perno de anclaje M12 x 100mm',
        description: 'Perno de anclaje M12 x 100mm con tuerca y arandela',
        category: 'Anclajes',
        unit: 'unidad',
        weight: 0.25,
        dimensions: 'M12 x 100mm',
        unitPrice: 8500.0,
        currency: 'COP',
        stock: 1500,
        reserved: 300,
        minStock: 200,
        isActive: true,
        supplier: 'Anclajes Especiales S.A.',
        leadTime: 10,
      },
      {
        sku: 'PROD-005',
        name: 'Perfil metálico U 100mm',
        description: 'Perfil metálico en U de 100mm de altura, 3m de largo',
        category: 'Perfiles',
        unit: 'unidad',
        weight: 12.5,
        dimensions: '100mm x 3000mm',
        unitPrice: 125000.0,
        currency: 'COP',
        stock: 200,
        reserved: 50,
        minStock: 30,
        isActive: true,
        supplier: 'Perfiles Metálicos del Norte',
        leadTime: 15,
      },
    ];

    for (const productData of products) {
      const product = this.productRepository.create(productData);
      await this.productRepository.save(product);
    }

    this.logger.log('Products seeded successfully');
  }

  private async seedUsers() {
    this.logger.log('Seeding users...');

    const users = [
      {
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@oben.com',
        passwordHash: '$2b$10$example_hashed_password', // In real app, this would be properly hashed
        role: UserRole.ADMIN,
        isActive: true,
      },
      {
        firstName: 'Sales',
        lastName: 'Manager',
        email: 'sales@oben.com',
        passwordHash: '$2b$10$example_hashed_password',
        role: UserRole.SALES,
        isActive: true,
      },
      {
        firstName: 'Production',
        lastName: 'Manager',
        email: 'production@oben.com',
        passwordHash: '$2b$10$example_hashed_password',
        role: UserRole.PRODUCTION,
        isActive: true,
      },
      {
        firstName: 'Logistics',
        lastName: 'Coordinator',
        email: 'logistics@oben.com',
        passwordHash: '$2b$10$example_hashed_password',
        role: UserRole.PRODUCTION,
        isActive: true,
      },
      {
        firstName: 'Finance',
        lastName: 'Manager',
        email: 'finance@oben.com',
        passwordHash: '$2b$10$example_hashed_password',
        role: UserRole.FINANCE,
        isActive: true,
      },
    ];

    for (const userData of users) {
      const user = this.userRepository.create(userData);
      await this.userRepository.save(user);
    }

    this.logger.log('Users seeded successfully');
  }

  private async seedQuotes() {
    this.logger.log('Seeding quotes...');

    const clients = await this.clientRepository.find();
    const products = await this.productRepository.find();

    if (clients.length === 0 || products.length === 0) {
      this.logger.warn('No clients or products found, skipping quotes seeding');
      return;
    }

    const quotes = [
      {
        quoteNumber: 'QUOTE-001',
        clientId: clients[0].id,
        totalAmount: 1500000.0,
        status: QuoteStatus.APPROVED,
        notes: 'Cotización para proyecto de infraestructura',
        validityDays: 30,
        createdAt: new Date('2026-05-01'),
        updatedAt: new Date('2026-05-02'),
      },
      {
        quoteNumber: 'QUOTE-002',
        clientId: clients[1].id,
        totalAmount: 2300000.0,
        status: QuoteStatus.SENT,
        notes: 'Cotización para construcción de edificio',
        validityDays: 30,
        createdAt: new Date('2026-05-10'),
        updatedAt: new Date('2026-05-10'),
      },
      {
        quoteNumber: 'QUOTE-003',
        clientId: clients[2].id,
        totalAmount: 850000.0,
        status: QuoteStatus.QUOTED,
        notes: 'Cotización preliminar para exportación',
        validityDays: 15,
        createdAt: new Date('2026-05-15'),
        updatedAt: new Date('2026-05-15'),
      },
    ];

    for (const quoteData of quotes) {
      const quote = this.quoteRepository.create(quoteData);
      await this.quoteRepository.save(quote);
    }

    this.logger.log('Quotes seeded successfully');
  }

  private async seedOrders() {
    this.logger.log('Seeding orders...');

    const clients = await this.clientRepository.find();
    const quotes = await this.quoteRepository.find();

    if (clients.length === 0) {
      this.logger.warn('No clients found, skipping orders seeding');
      return;
    }

    const orders = [
      {
        orderNumber: 'ORDER-001',
        clientId: clients[0].id,
        totalAmount: 1500000.0,
        status: OrderStatus.CONFIRMED,
        notes: 'Pedido confirmado desde cotización QUOTE-001',
        createdAt: new Date('2026-05-03'),
        updatedAt: new Date('2026-05-03'),
      },
      {
        orderNumber: 'ORDER-002',
        clientId: clients[1].id,
        totalAmount: 2300000.0,
        status: OrderStatus.PENDING_PRODUCTION,
        notes: 'Pedido nuevo para proyecto de construcción',
        createdAt: new Date('2026-05-12'),
        updatedAt: new Date('2026-05-12'),
      },
      {
        orderNumber: 'ORDER-003',
        clientId: clients[3].id,
        totalAmount: 3100000.0,
        status: OrderStatus.DELIVERED,
        notes: 'Pedido completado y entregado',
        createdAt: new Date('2026-04-15'),
        updatedAt: new Date('2026-04-25'),
      },
    ];

    for (const orderData of orders) {
      const order = this.orderRepository.create(orderData);
      await this.orderRepository.save(order);
    }

    this.logger.log('Orders seeded successfully');
  }

  private async seedProductionOrders() {
    this.logger.log('Seeding production orders...');

    const orders = await this.orderRepository.find();
    const products = await this.productRepository.find();

    if (orders.length === 0 || products.length === 0) {
      this.logger.warn(
        'No orders or products found, skipping production orders seeding',
      );
      return;
    }

    const productionOrders = [
      {
        productionOrderNumber: 'PROD-ORDER-001',
        orderId: orders[0].id,
        productId: products[0].id,
        status: ProductionOrderStatus.IN_PROGRESS,
        priority: ProductionPriority.HIGH,
        quantity: 1000.0,
        completedQuantity: 600.0,
        remainingQuantity: 400.0,
        productionLine: 'Linea A',
        scheduledStartDate: new Date('2026-05-05'),
        actualStartDate: new Date('2026-05-05'),
        scheduledCompletionDate: new Date('2026-05-20'),
        estimatedProductionTime: 120.0,
        actualProductionTime: 72.0,
        instructions: 'Producción prioritaria para cliente importante',
        qualityChecksPassed: true,
        yieldPercentage: 98.5,
        productionCost: 850000.0,
      },
      {
        productionOrderNumber: 'PROD-ORDER-002',
        orderId: orders[1].id,
        productId: products[1].id,
        status: ProductionOrderStatus.SCHEDULED,
        priority: ProductionPriority.NORMAL,
        quantity: 500.0,
        completedQuantity: 0.0,
        remainingQuantity: 500.0,
        productionLine: 'Linea B',
        scheduledStartDate: new Date('2026-05-18'),
        scheduledCompletionDate: new Date('2026-05-25'),
        estimatedProductionTime: 48.0,
        actualProductionTime: 0.0,
        instructions: 'Producción programada para próxima semana',
        qualityChecksPassed: false,
        yieldPercentage: 0.0,
        productionCost: 425000.0,
      },
    ];

    for (const productionOrderData of productionOrders) {
      const productionOrder =
        this.productionOrderRepository.create(productionOrderData);
      await this.productionOrderRepository.save(productionOrder);
    }

    this.logger.log('Production orders seeded successfully');
  }

  private async seedInvoices() {
    this.logger.log('Seeding invoices...');

    const orders = await this.orderRepository.find();

    if (orders.length === 0) {
      this.logger.warn('No orders found, skipping invoices seeding');
      return;
    }

    const invoices = [
      {
        invoiceNumber: 'INV-001',
        orderId: orders[0].id,
        amount: 1215000.0,
        taxAmount: 285000.0,
        totalAmount: 1500000.0,
        status: InvoiceStatus.PAID,
        dueDate: new Date('2026-06-04'),
        paidDate: new Date('2026-05-15'),
      },
      {
        invoiceNumber: 'INV-002',
        orderId: orders[1].id,
        amount: 1863000.0,
        taxAmount: 437000.0,
        totalAmount: 2300000.0,
        status: InvoiceStatus.PENDING,
        dueDate: new Date('2026-06-13'),
      },
    ];

    for (const invoiceData of invoices) {
      const invoice = this.invoiceRepository.create(invoiceData);
      await this.invoiceRepository.save(invoice);
    }

    this.logger.log('Invoices seeded successfully');
  }

  private async seedExportOperations() {
    this.logger.log('Seeding export operations...');

    const orders = await this.orderRepository.find();
    const clients = await this.clientRepository.find();
    const incoterms = await this.incotermRepository.find();

    if (orders.length === 0 || clients.length === 0 || incoterms.length === 0) {
      this.logger.warn(
        'No orders, clients or incoterms found, skipping export operations seeding',
      );
      return;
    }

    const exportOperations = [
      {
        exportNumber: 'EXP-001',
        orderId: orders[2].id,
        clientId: clients[2].id,
        status: ExportOperationStatus.SHIPPED,
        type: ExportType.STANDARD,
        destinationCountry: 'United States',
        destinationPort: 'Port of Miami',
        destinationAddress: '123 Logistics St, Miami, FL 33101',
        incotermId: incoterms[2].id, // CIF
        orderValue: 3100000.0,
        liquidatedValue: 3250000.0,
        totalCosts: 850000.0,
        totalRevenue: 3250000.0,
        profitMargin: 15.2,
        totalGrossWeight: 12500.0,
        totalNetWeight: 11800.0,
        totalVolume: 250.0,
        totalPackages: 125,
        containerType: '40HC',
        containerNumber: 'CBHU1234567',
        expectedDepartureDate: new Date('2026-04-20'),
        actualDepartureDate: new Date('2026-04-20'),
        expectedArrivalDate: new Date('2026-05-05'),
        actualArrivalDate: new Date('2026-05-04'),
        customsCleared: true,
        customsClearedAt: new Date('2026-05-06'),
        specialRequirements: 'Fragile items, handle with care',
        requiresExportLicense: false,
      },
    ];

    for (const exportOperationData of exportOperations) {
      const exportOperation =
        this.exportOperationRepository.create(exportOperationData);
      await this.exportOperationRepository.save(exportOperation);
    }

    this.logger.log('Export operations seeded successfully');
  }

  private async seedFreightQuotes() {
    this.logger.log('Seeding freight quotes...');

    const exportOperations = await this.exportOperationRepository.find();

    if (exportOperations.length === 0) {
      this.logger.warn(
        'No export operations found, skipping freight quotes seeding',
      );
      return;
    }

    const freightQuotes = [
      {
        quoteNumber: 'FQ-001',
        exportOperationId: exportOperations[0].id,
        carrier: 'Maersk Line',
        serviceType: 'Ocean Freight',
        origin: 'Port of Cartagena',
        destination: 'Port of Miami',
        expectedDeparture: new Date('2026-04-20'),
        expectedArrival: new Date('2026-05-05'),
        transitTime: 15,
        currency: 'USD',
        freightCost: 12000.0,
        additionalCharges: 500.0,
        totalAmount: 12500.0,
        status: FreightQuoteStatus.ACCEPTED,
        notes: 'Cotización aceptada para envío urgente',
        freightType: FreightType.SEA,
        serviceLevel: FreightServiceLevel.STANDARD,
        validUntil: new Date('2026-06-20'),
      },
    ];

    for (const freightQuoteData of freightQuotes) {
      const freightQuote = this.freightQuoteRepository.create(freightQuoteData);
      await this.freightQuoteRepository.save(freightQuote);
    }

    this.logger.log('Freight quotes seeded successfully');
  }

  private async seedInsuranceQuotes() {
    this.logger.log('Seeding insurance quotes...');

    const exportOperations = await this.exportOperationRepository.find();

    if (exportOperations.length === 0) {
      this.logger.warn(
        'No export operations found, skipping insurance quotes seeding',
      );
      return;
    }

    const insuranceQuotes = [
      {
        quoteNumber: 'IQ-001',
        exportOperationId: exportOperations[0].id,
        insuranceCompany: 'Allianz Seguros',
        coverageType: CoverageType.COMPREHENSIVE,
        currency: 'USD',
        premium: 625.0,
        insuredValue: 3250000.0,
        status: InsuranceQuoteStatus.ACCEPTED,
        coverageStartDate: new Date('2026-04-20'),
        coverageEndDate: new Date('2026-05-05'),
        origin: 'Port of Cartagena',
        destination: 'Port of Miami',
        transportMode: 'Ocean Freight',
        totalGrossWeight: 12500.0,
        totalVolume: 250.0,
        validUntil: new Date('2026-06-20'),
        premiumRate: 0.019,
        notes: 'Seguro completo para carga de alto valor',
        insuranceType: InsuranceType.CARGO,
      },
    ];

    for (const insuranceQuoteData of insuranceQuotes) {
      const insuranceQuote =
        this.insuranceQuoteRepository.create(insuranceQuoteData);
      await this.insuranceQuoteRepository.save(insuranceQuote);
    }

    this.logger.log('Insurance quotes seeded successfully');
  }

  private async seedExportCostSheets() {
    this.logger.log('Seeding export cost sheets...');

    const exportOperations = await this.exportOperationRepository.find();

    if (exportOperations.length === 0) {
      this.logger.warn(
        'No export operations found, skipping export cost sheets seeding',
      );
      return;
    }

    const exportCostSheets = [
      {
        costSheetNumber: 'CS-001',
        exportOperationId: exportOperations[0].id,
        totalProductCost: 2000000.0,
        freightCost: 12500.0,
        insuranceCost: 625.0,
        customsCost: 850.0,
        handlingCost: 1200.0,
        documentationCost: 200.0,
        bankCost: 150.0,
        commissionCost: 325.0,
        otherCost: 375.0,
        totalCost: 2015900.0,
        totalRevenue: 3250000.0,
        grossProfit: 1234100.0,
        grossProfitMargin: 37.97,
        netProfit: 1234100.0,
        netProfitMargin: 37.97,
        costToRevenueRatio: 62.03,
        currency: 'USD',
        status: CostSheetStatus.FINALIZED,
        isFinalized: true,
        notes: 'Hoja de costos para operación de exportación completa',
      },
    ];

    for (const exportCostSheetData of exportCostSheets) {
      const exportCostSheet =
        this.exportCostSheetRepository.create(exportCostSheetData);
      await this.exportCostSheetRepository.save(exportCostSheet);
    }

    this.logger.log('Export cost sheets seeded successfully');
  }

  private async seedMasterPackingLists() {
    this.logger.log('Seeding master packing lists...');

    const orders = await this.orderRepository.find();
    const exportOperations = await this.exportOperationRepository.find();

    if (orders.length === 0) {
      this.logger.warn(
        'No orders found, skipping master packing lists seeding',
      );
      return;
    }

    const masterPackingLists = [
      {
        masterPackingListNumber: 'MPL-001',
        orderId: orders[2].id,
        status: MasterPackingListStatus.COMPLETED,
        type: MasterPackingListType.MASTER,
        totalItems: 1500,
        totalPackages: 125,
        totalGrossWeight: 12500.0,
        totalNetWeight: 11800.0,
        totalVolume: 250.0,
        masterPackageDimensions: '1200x800x600mm',
        warehouseLocation: 'Bodega A-01',
        packedAt: new Date('2026-04-18'),
        qualityCheckedAt: new Date('2026-04-19'),
        qualityCheckPassed: true,
        qualityCheckNotes: 'Inspección completada satisfactoriamente',
        expectedShippingDate: new Date('2026-04-20'),
        isPrinted: true,
        printedAt: new Date('2026-04-19'),
        exporter: 'Oben DTA S.A.S.',
        consignee: 'Global Importers Inc.',
        notifyParty: 'Logistics Solutions LLC',
        portOfLoading: 'Port of Cartagena',
        portOfDischarge: 'Port of Miami',
        placeOfDelivery: 'Miami Distribution Center',
        vesselFlight: 'MAERSK EINDHOVEN',
        voyageNumber: 'V.12345',
        vesselDepartureDate: new Date('2026-04-20'),
        vesselArrivalDate: new Date('2026-05-04'),
        containerNumber: 'CBHU1234567',
        sealNumber: 'SEAL-789012',
        customsInfo: 'Customs Reference: CUS-2026-001',
      },
    ];

    for (const masterPackingListData of masterPackingLists) {
      const masterPackingList = this.masterPackingListRepository.create(
        masterPackingListData,
      );
      await this.masterPackingListRepository.save(masterPackingList);
    }

    this.logger.log('Master packing lists seeded successfully');
  }

  private async seedPackingLists() {
    this.logger.log('Seeding packing lists...');

    const orders = await this.orderRepository.find();
    const masterPackingLists = await this.masterPackingListRepository.find();

    if (orders.length === 0) {
      this.logger.warn('No orders found, skipping packing lists seeding');
      return;
    }

    const packingLists = [
      {
        packingListNumber: 'PL-001',
        orderId: orders[2].id,
        status: PackingListStatus.COMPLETED,
        type: PackingListType.STANDARD,
        totalItems: 500,
        totalPackages: 42,
        totalGrossWeight: 4200.0,
        totalNetWeight: 3950.0,
        totalVolume: 85.0,
        masterPackageDimensions: '1200x800x200mm',
        warehouseLocation: 'Bodega A-01',
        packedAt: new Date('2026-04-18'),
        qualityCheckedAt: new Date('2026-04-19'),
        qualityCheckPassed: true,
        qualityCheckNotes: 'Inspección completada satisfactoriamente',
        expectedShippingDate: new Date('2026-04-20'),
        isPrinted: true,
        printedAt: new Date('2026-04-19'),
        batchNumber: 'BATCH-2026-001',
        description: 'Lote de tornillos y tuercas para exportación',
      },
    ];

    for (const packingListData of packingLists) {
      const packingList = this.packingListRepository.create(packingListData);
      await this.packingListRepository.save(packingList);
    }

    this.logger.log('Packing lists seeded successfully');
  }

  private async seedShipments() {
    this.logger.log('Seeding shipments...');

    const orders = await this.orderRepository.find();
    const exportOperations = await this.exportOperationRepository.find();

    if (orders.length === 0) {
      this.logger.warn('No orders found, skipping shipments seeding');
      return;
    }

    const shipments = [
      {
        shipmentNumber: 'SHP-001',
        orderId: orders[2].id,
        exportOperationId:
          exportOperations.length > 0 ? exportOperations[0].id : undefined,
        status: ShipmentStatus.DELIVERED,
        type: ShipmentType.EXPORT,
        carrierType: CarrierType.THIRD_PARTY,
        origin: 'Bogotá, Colombia',
        destination: 'Miami, FL, USA',
        carrier: 'Maersk Line',
        trackingNumber: 'MAEU123456789',
        vehicleNumber: 'CBHU1234567',
        scheduledPickupDate: new Date('2026-04-20'),
        actualPickupDate: new Date('2026-04-20'),
        scheduledDeliveryDate: new Date('2026-05-05'),
        actualDeliveryDate: new Date('2026-05-04'),
        totalGrossWeight: 12500.0,
        totalNetWeight: 11800.0,
        totalVolume: 250.0,
        totalPackages: 125,
        shippingCost: 12500.0,
        currency: 'USD',
        shippingMethod: 'Ocean Freight',
        requiresSignature: true,
        deliveryInstructions: 'Entregar a recepción, firmar POD',
        containsHazardousMaterials: false,
        requiresInsurance: true,
        insurancePolicyNumber: 'POL-2026-001',
        customsBroker: 'Customs Brokers Intl',
        customsReference: 'CUS-2026-001',
        customsClearedAt: new Date('2026-05-06'),
        customsCleared: true,
        deliverySuccessful: true,
        notes: 'Entrega completada con éxito',
      },
    ];

    for (const shipmentData of shipments) {
      const shipment = this.shipmentRepository.create(shipmentData);
      await this.shipmentRepository.save(shipment);
    }

    this.logger.log('Shipments seeded successfully');
  }
}
