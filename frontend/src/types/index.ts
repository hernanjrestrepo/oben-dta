// API Types for Oben-DTA Frontend

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  tenantId?: string | null;
  tenantSlug?: string | null;
  isSuperAdmin?: boolean;
  permissions?: string[];
}

export interface IntegrationStatus {
  system: string;
  mode: 'real' | 'mock';
  state: 'operational' | 'pending_credentials' | 'unreachable' | 'error' | 'disabled';
  message: string;
  latencyMs: number | null;
}

export interface LicenseStatusView {
  valid: boolean;
  reason: string | null;
  graceActive: boolean;
  daysRemaining: number | null;
  renewalDue: boolean;
  expiresAt: string | null;
  planKey: string | null;
}

export interface CommercialLicense {
  id: string;
  installationId: string;
  status: 'active' | 'suspended' | 'revoked';
  issuedAt: string;
  expiresAt: string;
  gracePeriodDays: number;
  maxUsers: number;
  maxSites: number;
  offline: boolean;
}

// --- Panel SuperAdmin de plataforma ---------------------------------------

export type TenantStatus = 'active' | 'suspended' | 'trial' | 'archived';

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  legalName?: string;
  taxId?: string;
  countryCode: string;
  defaultCurrency: string;
  timezone: string;
  status: TenantStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Plan {
  id: string;
  key: string;
  name: string;
  description?: string;
  priceMonthly: number;
  currency: string;
  maxUsers: number;
  maxStorageGb: number;
  isActive: boolean;
  modules: string[];
}

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';

export interface TenantSubscription {
  id: string;
  tenantId: string;
  planId: string;
  plan?: Plan;
  status: SubscriptionStatus;
  startsAt: string;
  endsAt: string | null;
}

export interface TenantFeatureFlag {
  id: string;
  tenantId: string;
  moduleKey: string;
  enabled: boolean;
  reason: string | null;
  setBy: string | null;
}

export interface PlatformRole {
  id: string;
  key: string;
  name: string;
  description: string | null;
}

export interface PlatformUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  isSuperAdmin: boolean;
  createdAt: string;
  platformRoles: string[];
}

export interface AuditRow {
  id: string;
  tenantId: string | null;
  userId: string | null;
  permissionKey: string | null;
  moduleKey: string | null;
  route: string | null;
  method: string | null;
  ip: string | null;
  granted: boolean;
  deniedReason: string | null;
  createdAt: string;
}

export interface AuditPage {
  total: number;
  page: number;
  pageSize: number;
  items: AuditRow[];
}

export interface SystemStatus {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptimeSeconds: number;
  database: { status: 'ok' | 'error'; migrationsApplied: number };
  tenants: Record<string, number> & { total: number };
  subscriptions: Record<string, number> & { total: number };
  platformUsers: { total: number; active: number; superAdmins: number };
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: User;
  license?: {
    valid: boolean;
    reason: string | null;
    graceActive: boolean;
    daysRemaining: number | null;
    renewalDue: boolean;
  } | null;
}

export interface Client {
  id: string;
  clientId: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  creditLimit: number;
  usedCredit: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  orders?: Order[];
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  isActive: boolean;
}

export interface OrderItem {
  id: string;
  productId: string;
  product?: Product;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export type OrderStatus =
  | 'DRAFT'
  | 'PENDING_VALIDATION'
  | 'CONFIRMED'
  | 'PENDING_PRODUCTION'
  | 'IN_PRODUCTION'
  | 'READY_FOR_DELIVERY'
  | 'DELIVERED'
  | 'BLOCKED'
  | 'CANCELLED';

export interface Order {
  id: string;
  orderNumber: string;
  clientId: string;
  client?: Client;
  totalAmount: number;
  status: OrderStatus;
  notes?: string;
  blockedReason?: string;
  validatedBy?: string;
  validatedAt?: string;
  invoiceNumber?: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderItemDto {
  productId: string;
  quantity: number;
}

export interface CreateOrderDto {
  clientId: string;
  orderNumber: string;
  notes?: string;
  items: CreateOrderItemDto[];
}

export interface UpdateOrderStatusDto {
  status: OrderStatus;
  blockedReason?: string;
  validatedBy?: string;
}

export interface DashboardKPIs {
  totalOrders: number;
  activeOrders: number;
  totalClients: number;
  totalRevenue: number;
  ordersByStatus: Record<string, number>;
  recentOrders: Order[];
}

export interface ApiError {
  statusCode: number;
  message: string;
  timestamp: string;
  path: string;
}


export type InvoiceStatus = 'PENDING' | 'APPROVED' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export type DianStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  orderId: string;
  order?: Order;
  amount: number;
  taxAmount: number;
  totalAmount: number;
  status: InvoiceStatus;
  dianStatus: DianStatus;
  dianCufe?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

// Cotizaciones — pipeline automatizado correo -> cotización -> pago -> producción -> entrega
export type QuoteStatus =
  | 'RECEIVED'
  | 'PARSING'
  | 'QUOTED'
  | 'SENT'
  | 'APPROVED'
  | 'ORDERED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'IN_PRODUCTION'
  | 'READY_FOR_DELIVERY'
  | 'DELIVERED'
  | 'REJECTED';

export interface QuoteItem {
  id: string;
  productId: string;
  product?: Product;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Quote {
  id: string;
  quoteNumber: string;
  clientId: string;
  client?: Client;
  originalEmail?: string | null;
  items: QuoteItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  status: QuoteStatus;
  pdfUrl?: string | null;
  paymentLink?: string | null;
  invoiceNumber?: string | null;
  approvedAt?: string | null;
  paidAt?: string | null;
  deliveredAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InboxEmail {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  receivedAt: string;
  status: 'UNREAD' | 'READ' | 'REPLIED';
  replyText?: string;
  replyAt?: string;
}

export interface QuoteFlowResult {
  quote: Quote;
  emailId: string;
  steps: string[];
}

// --- Administración Enterprise (usuarios / perfiles / permisos del tenant) --

export interface TenantUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  isLocked: boolean;
  createdAt: string;
  roles: string[];
}

export interface CreateTenantUserDto {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  roleKeys?: string[];
}

export interface UpdateTenantUserDto {
  firstName?: string;
  lastName?: string;
  email?: string;
  isActive?: boolean;
}

export interface SecurityPermission {
  id: string;
  key: string;
  moduleKey: string;
  action: string;
  name: string;
  description: string | null;
  isPlatform: boolean;
}

export interface SecurityModuleCatalog {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  isActive: boolean;
}

export interface SecurityRole {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissions: SecurityPermission[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoleDto {
  key: string;
  name: string;
  description?: string;
  permissions: string[];
}

export interface UpdateRoleDto {
  name?: string;
  description?: string;
  isActive?: boolean;
  permissions?: string[];
}

// --- Auditoría de negocio (workflow_events) ---------------------------------

export interface WorkflowEvent {
  id: string;
  eventType: string;
  status: string;
  workflowName: string;
  fromState: string;
  toState: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  inputData: Record<string, unknown> | null;
  outputData: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string;
}

