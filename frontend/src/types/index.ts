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

// EVA real — orquestación LLM + tool calling (/eva/process)
export interface EvaToolTrace {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface EvaResult {
  model: string;
  reply: string;
  trace: EvaToolTrace[];
  orderId: string | null;
  orderNumber: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  iterations: number;
}

// ADÁN — respuesta RAG con fuentes (/adan/ask)
export interface AdanSource {
  documentId: string;
  fileName: string;
  chunkIndex: number;
  similarity: number;
  excerpt: string;
}

export interface AdanAnswer {
  question: string;
  answer: string;
  sources: AdanSource[];
  model: string;
  grounded: boolean;
}

export interface AdanStats {
  documents: number;
  chunks: number;
  embeddings: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  orderId: string;
  amount: number;
  taxAmount: number;
  totalAmount: number;
  status: string;
  dianStatus: string;
  createdAt: string;
}

