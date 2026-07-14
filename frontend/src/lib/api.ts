import axios, { AxiosError, AxiosInstance } from 'axios';
import {
  ApiError, AuditPage, AuthResponse, Client, CommercialLicense,
  CreateOrderDto, CreateRoleDto, CreateTenantUserDto, DashboardKPIs, DemoResult, InboxEmail, IntegrationStatus,
  Invoice, LicenseStatusView, Order, Plan, PlatformRole, PlatformUser, Product, Quote,
  QuoteFlowResult, SecurityModuleCatalog, SecurityPermission, SecurityRole, SystemStatus, Tenant,
  TenantFeatureFlag, TenantSubscription, TenantUser, UpdateOrderStatusDto, UpdateRoleDto,
  UpdateTenantUserDto, User, WorkflowEvent,
} from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:3004';

class ApiClient {
  private client: AxiosInstance;
  private refreshPromise: Promise<string | null> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Request interceptor — attach JWT token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('access_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error),
    );

    // Response interceptor — on 401, attempt ONE silent refresh + retry before
    // giving up. Avoids forcing a full re-login every 15 minutes (access token
    // lifetime) while still respecting server-side revocation (logout, token
    // rotation reuse-detection) since a revoked refresh token fails cleanly.
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<ApiError>) => {
        const originalRequest = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
        const url = originalRequest?.url ?? '';
        // Login/refresh failures are handled by the caller (login form shows its
        // own error; tryRefresh() below already uses a bare axios call so it
        // never re-enters this interceptor) — never redirect on those.
        const isLoginEndpoint = url.includes('/auth/login') || url.includes('/auth/platform-login');
        const isAuthEndpoint = url.includes('/auth/');

        if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
          originalRequest._retry = true;
          const newToken = await this.tryRefresh();
          if (newToken) {
            originalRequest.headers = originalRequest.headers ?? {};
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return this.client.request(originalRequest);
          }
        }

        if (error.response?.status === 401 && !isLoginEndpoint) {
          const currentUser = this.getUser();
          const wasPlatformUser = !!currentUser && !currentUser.tenantId;
          this.clearAuth();
          if (typeof window !== 'undefined') {
            window.location.href = wasPlatformUser ? '/platform/login' : '/login';
          }
        }

        return Promise.reject(error);
      },
    );
  }

  private async tryRefresh(): Promise<string | null> {
    const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null;
    if (!refreshToken) return null;

    if (!this.refreshPromise) {
      this.refreshPromise = axios
        .post<AuthResponse>(`${API_BASE_URL}/auth/refresh`, { refresh_token: refreshToken })
        .then(({ data }) => {
          this.setAuth(data);
          return data.access_token;
        })
        .catch(() => null)
        .finally(() => {
          this.refreshPromise = null;
        });
    }
    return this.refreshPromise;
  }

  clearAuth() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    // Mirror token removal into the cookie the Next.js middleware reads.
    if (typeof document !== 'undefined') {
      document.cookie = 'access_token=; path=/; max-age=0; SameSite=Lax';
    }
  }

  setAuth(response: AuthResponse) {
    localStorage.setItem('access_token', response.access_token);
    localStorage.setItem('refresh_token', response.refresh_token);
    localStorage.setItem('user', JSON.stringify(response.user));
    // The Next.js middleware (src/middleware.ts) only checks for the cookie's
    // PRESENCE — it never decodes/verifies the JWT — so its max-age should
    // track the SESSION lifetime (the refresh token, 7d), not the 15m access
    // token. Actual per-request freshness is handled by the Authorization
    // header + the axios silent-refresh interceptor above. Using the access
    // token's own 15m lifetime here was a real bug: it logged users out of
    // navigation mid-session even though a valid refresh token still existed.
    if (typeof document !== 'undefined') {
      document.cookie = `access_token=${response.access_token}; path=/; max-age=604800; SameSite=Lax`;
    }
  }

  getUser(): User | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }

  isAuthenticated(): boolean {
    return !!this.getUser() && !!localStorage.getItem('access_token');
  }

  // Auth
  async login(email: string, password: string): Promise<AuthResponse> {
    const { data } = await this.client.post<AuthResponse>('/auth/login', { email, password });
    this.setAuth(data);
    return data;
  }

  async platformLogin(email: string, password: string): Promise<AuthResponse> {
    const { data } = await this.client.post<AuthResponse>('/auth/platform-login', { email, password });
    this.setAuth(data);
    return data;
  }

  async register(dto: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role?: string;
  }): Promise<AuthResponse> {
    const { data } = await this.client.post<AuthResponse>('/auth/register', dto);
    this.setAuth(data);
    return data;
  }

  async getInvoices(): Promise<Invoice[]> {
    const { data } = await this.client.get<Invoice[]>('/invoices');
    return data;
  }

  async getInvoice(id: string): Promise<Invoice> {
    const { data } = await this.client.get<Invoice>(`/invoices/${id}`);
    return data;
  }

  async updateInvoiceStatus(id: string, dto: { status: string; paidAt?: string }): Promise<Invoice> {
    const { data } = await this.client.put<Invoice>(`/invoices/${id}/status`, dto);
    return data;
  }

  // Demo automático (WO-013 Sprint 6)
  async runDemo(): Promise<DemoResult> {
    const { data } = await this.client.post<DemoResult>('/demo/run');
    return data;
  }

  // Dashboard
  async getDashboardKPIs(): Promise<DashboardKPIs> {
    // Aggregate from multiple endpoints to build KPI view
    const [ordersRes, clientsRes] = await Promise.all([
      this.client.get<Order[]>('/orders'),
      this.client.get<Client[]>('/clients'),
    ]);

    const orders = ordersRes.data;
    const clients = clientsRes.data;

    const activeStatuses = ['PENDING_VALIDATION', 'CONFIRMED', 'PENDING_PRODUCTION', 'IN_PRODUCTION', 'READY_FOR_DELIVERY'];
    const activeOrders = orders.filter((o) => activeStatuses.includes(o.status));

    const ordersByStatus: Record<string, number> = {};
    orders.forEach((o) => {
      ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1;
    });

    const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);

    return {
      totalOrders: orders.length,
      activeOrders: activeOrders.length,
      totalClients: clients.length,
      totalRevenue,
      ordersByStatus,
      recentOrders: orders.slice(0, 5),
    };
  }

  // Orders
  async getOrders(): Promise<Order[]> {
    const { data } = await this.client.get<Order[]>('/orders');
    return data;
  }

  async getOrder(id: string): Promise<Order> {
    const { data } = await this.client.get<Order>(`/orders/${id}`);
    return data;
  }

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    const { data } = await this.client.post<Order>('/orders', dto);
    return data;
  }

  async deleteOrder(id: string): Promise<void> {
    await this.client.delete(`/orders/${id}`);
  }

  async updateOrderStatus(id: string, dto: UpdateOrderStatusDto): Promise<Order> {
    const { data } = await this.client.put<Order>(`/orders/${id}/status`, dto);
    return data;
  }

  // Clients
  async getClients(): Promise<Client[]> {
    const { data } = await this.client.get<Client[]>('/clients');
    return data;
  }

  async getClient(id: string): Promise<Client> {
    const { data } = await this.client.get<Client>(`/clients/${id}`);
    return data;
  }

  async createClient(dto: {
    clientId: string;
    name: string;
    email: string;
    phone?: string;
    address?: string;
    creditLimit?: number;
  }): Promise<Client> {
    const { data } = await this.client.post<Client>('/clients', dto);
    return data;
  }

  async updateClient(id: string, dto: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    creditLimit?: number;
    isActive?: boolean;
  }): Promise<Client> {
    const { data } = await this.client.put<Client>(`/clients/${id}`, dto);
    return data;
  }

  async deleteClient(id: string): Promise<void> {
    await this.client.delete(`/clients/${id}`);
  }

  // Products (for order creation)
  async getProducts(): Promise<Product[]> {
    const { data } = await this.client.get<Product[]>('/products');
    return data;
  }

  // --- Panel SuperAdmin de plataforma -------------------------------------

  async getTenants(): Promise<Tenant[]> {
    const { data } = await this.client.get<Tenant[]>('/platform/tenants');
    return data;
  }

  async getTenant(id: string): Promise<Tenant> {
    const { data } = await this.client.get<Tenant>(`/platform/tenants/${id}`);
    return data;
  }

  async createTenant(dto: {
    slug: string;
    name: string;
    legalName?: string;
    taxId?: string;
    countryCode?: string;
    defaultCurrency?: string;
    timezone?: string;
  }): Promise<Tenant> {
    const { data } = await this.client.post<Tenant>('/platform/tenants', dto);
    return data;
  }

  async updateTenant(id: string, dto: Partial<Pick<Tenant, 'name' | 'legalName' | 'taxId' | 'status'>>): Promise<Tenant> {
    const { data } = await this.client.patch<Tenant>(`/platform/tenants/${id}`, dto);
    return data;
  }

  async archiveTenant(id: string): Promise<Tenant> {
    const { data } = await this.client.delete<Tenant>(`/platform/tenants/${id}`);
    return data;
  }

  async getPlans(): Promise<Plan[]> {
    const { data } = await this.client.get<Plan[]>('/platform/plans');
    return data;
  }

  async createPlan(dto: {
    key: string;
    name: string;
    description?: string;
    priceMonthly?: number;
    currency?: string;
    maxUsers?: number;
    maxStorageGb?: number;
    modules: string[];
  }): Promise<Plan> {
    const { data } = await this.client.post<Plan>('/platform/plans', dto);
    return data;
  }

  async updatePlanModules(key: string, modules: string[]): Promise<Plan> {
    const { data } = await this.client.put<Plan>(`/platform/plans/${key}/modules`, { modules });
    return data;
  }

  async getModules(): Promise<Array<{ key: string; name: string; category: string }>> {
    const { data } = await this.client.get('/platform/modules');
    return data;
  }

  async getTenantSubscription(tenantId: string): Promise<TenantSubscription | null> {
    const { data } = await this.client.get<TenantSubscription | null>(`/platform/tenants/${tenantId}/subscription`);
    return data;
  }

  async assignSubscription(tenantId: string, dto: { planKey: string; status?: string; endsAt?: string }): Promise<TenantSubscription> {
    const { data } = await this.client.put<TenantSubscription>(`/platform/tenants/${tenantId}/subscription`, dto);
    return data;
  }

  async getFeatureFlags(tenantId: string): Promise<TenantFeatureFlag[]> {
    const { data } = await this.client.get<TenantFeatureFlag[]>(`/platform/tenants/${tenantId}/feature-flags`);
    return data;
  }

  async setFeatureFlag(tenantId: string, dto: { moduleKey: string; enabled: boolean; reason?: string }): Promise<TenantFeatureFlag> {
    const { data } = await this.client.put<TenantFeatureFlag>(`/platform/tenants/${tenantId}/feature-flags`, dto);
    return data;
  }

  async getTenantLicense(tenantId: string): Promise<{
    tenantId: string;
    planKey: string | null;
    subscriptionStatus: string | null;
    modulesEnabled: string[];
    planModules: string[];
    flagOverrides: Record<string, boolean>;
    commercialLicense: CommercialLicense | null;
    valid: boolean;
    reason: string | null;
    graceActive: boolean;
    daysRemaining: number | null;
    renewalDue: boolean;
  }> {
    const { data } = await this.client.get(`/platform/tenants/${tenantId}/license`);
    return data;
  }

  async issueLicense(tenantId: string, dto: {
    planKey: string;
    durationDays?: number;
    maxUsers?: number;
    maxSites?: number;
    gracePeriodDays?: number;
    offline?: boolean;
  }): Promise<CommercialLicense> {
    const { data } = await this.client.post<CommercialLicense>(`/platform/tenants/${tenantId}/license`, dto);
    return data;
  }

  async renewLicense(tenantId: string, dto: { durationDays?: number; expiresAt?: string }): Promise<CommercialLicense> {
    const { data } = await this.client.put<CommercialLicense>(`/platform/tenants/${tenantId}/license/renew`, dto);
    return data;
  }

  async getPlatformRoles(): Promise<PlatformRole[]> {
    const { data } = await this.client.get<PlatformRole[]>('/platform/platform-roles');
    return data;
  }

  async getPlatformUsers(): Promise<PlatformUser[]> {
    const { data } = await this.client.get<PlatformUser[]>('/platform/users');
    return data;
  }

  async createPlatformUser(dto: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    platformRoleKey?: string;
  }): Promise<PlatformUser> {
    const { data } = await this.client.post<PlatformUser>('/platform/users', dto);
    return data;
  }

  async updatePlatformUser(id: string, dto: { firstName?: string; lastName?: string; isActive?: boolean; password?: string }): Promise<PlatformUser> {
    const { data } = await this.client.patch<PlatformUser>(`/platform/users/${id}`, dto);
    return data;
  }

  async deletePlatformUser(id: string): Promise<void> {
    await this.client.delete(`/platform/users/${id}`);
  }

  async assignPlatformRole(userId: string, platformRoleKey: string): Promise<void> {
    await this.client.post('/platform/platform-roles/assign', { userId, platformRoleKey });
  }

  async unassignPlatformRole(userId: string, platformRoleKey: string): Promise<void> {
    await this.client.delete('/platform/platform-roles/assign', { data: { userId, platformRoleKey } });
  }

  async getAudit(params: {
    tenantId?: string;
    userId?: string;
    permissionKey?: string;
    granted?: string;
    page?: number;
    pageSize?: number;
  }): Promise<AuditPage> {
    const { data } = await this.client.get<AuditPage>('/platform/audit', { params });
    return data;
  }

  async getSystemStatus(): Promise<SystemStatus> {
    const { data } = await this.client.get<SystemStatus>('/platform/system-status');
    return data;
  }

  // --- Licenciamiento (tenant-facing) -------------------------------------

  async getLicenseStatus(): Promise<LicenseStatusView> {
    const { data } = await this.client.get<LicenseStatusView>('/license/status');
    return data;
  }

  // --- Integration Hub -----------------------------------------------------

  async getIntegrationsStatus(): Promise<IntegrationStatus[]> {
    const { data } = await this.client.get<IntegrationStatus[]>('/integrations/status');
    return data;
  }

  // --- Cotizaciones (pipeline correo -> pago -> producción -> entrega) ----

  async getQuotes(): Promise<Quote[]> {
    const { data } = await this.client.get<Quote[]>('/quotes');
    return data;
  }

  async getQuote(id: string): Promise<Quote> {
    const { data } = await this.client.get<Quote>(`/quotes/${id}`);
    return data;
  }

  async getQuotesInbox(): Promise<InboxEmail[]> {
    const { data } = await this.client.get<InboxEmail[]>('/quotes/inbox/emails');
    return data;
  }

  async sendQuoteEmail(dto: { from: string; subject: string; body: string }): Promise<QuoteFlowResult> {
    const { data } = await this.client.post<QuoteFlowResult>('/quotes/email', dto);
    return data;
  }

  async generateQuotePdf(id: string): Promise<Quote> {
    const { data } = await this.client.post<Quote>(`/quotes/${id}/pdf`);
    return data;
  }

  async downloadQuotePdf(id: string): Promise<Blob> {
    const { data } = await this.client.get(`/quotes/${id}/pdf`, { responseType: 'blob' });
    return data;
  }

  async approveQuote(id: string, emailId: string): Promise<Quote> {
    const { data } = await this.client.post<Quote>(`/quotes/${id}/approve`, { emailId });
    return data;
  }

  async rejectQuote(id: string, emailId: string): Promise<Quote> {
    const { data } = await this.client.post<Quote>(`/quotes/${id}/reject`, { emailId });
    return data;
  }

  async createQuotePaymentLink(id: string): Promise<Quote> {
    const { data } = await this.client.post<Quote>(`/quotes/${id}/payment-link`);
    return data;
  }

  async simulateQuotePayment(id: string): Promise<Quote> {
    const { data } = await this.client.post<Quote>(`/quotes/${id}/pay`);
    return data;
  }

  async moveQuoteToProduction(id: string): Promise<Quote> {
    const { data } = await this.client.post<Quote>(`/quotes/${id}/production`);
    return data;
  }

  async markQuoteReady(id: string): Promise<Quote> {
    const { data } = await this.client.post<Quote>(`/quotes/${id}/ready`);
    return data;
  }

  async markQuoteDelivered(id: string): Promise<Quote> {
    const { data } = await this.client.post<Quote>(`/quotes/${id}/delivered`);
    return data;
  }

  // --- Administración Enterprise (usuarios / perfiles / permisos) ---------

  async getTenantUsers(): Promise<TenantUser[]> {
    const { data } = await this.client.get<TenantUser[]>('/users');
    return data;
  }

  async getTenantUser(id: string): Promise<TenantUser> {
    const { data } = await this.client.get<TenantUser>(`/users/${id}`);
    return data;
  }

  async createTenantUser(dto: CreateTenantUserDto): Promise<TenantUser> {
    const { data } = await this.client.post<TenantUser>('/users', dto);
    return data;
  }

  async updateTenantUser(id: string, dto: UpdateTenantUserDto): Promise<TenantUser> {
    const { data } = await this.client.put<TenantUser>(`/users/${id}`, dto);
    return data;
  }

  async deleteTenantUser(id: string): Promise<void> {
    await this.client.delete(`/users/${id}`);
  }

  async activateTenantUser(id: string): Promise<TenantUser> {
    const { data } = await this.client.post<TenantUser>(`/users/${id}/activate`);
    return data;
  }

  async deactivateTenantUser(id: string): Promise<TenantUser> {
    const { data } = await this.client.post<TenantUser>(`/users/${id}/deactivate`);
    return data;
  }

  async lockTenantUser(id: string): Promise<TenantUser> {
    const { data } = await this.client.post<TenantUser>(`/users/${id}/lock`);
    return data;
  }

  async unlockTenantUser(id: string): Promise<TenantUser> {
    const { data } = await this.client.post<TenantUser>(`/users/${id}/unlock`);
    return data;
  }

  async resetTenantUserPassword(id: string, password: string): Promise<TenantUser> {
    const { data } = await this.client.post<TenantUser>(`/users/${id}/reset-password`, { password });
    return data;
  }

  async assignUserRole(userId: string, roleKey: string): Promise<void> {
    await this.client.post('/security/users/roles', { userId, roleKey });
  }

  async unassignUserRole(userId: string, roleKey: string): Promise<void> {
    await this.client.delete('/security/users/roles', { data: { userId, roleKey } });
  }

  async getSecurityModules(): Promise<SecurityModuleCatalog[]> {
    const { data } = await this.client.get<SecurityModuleCatalog[]>('/security/modules');
    return data;
  }

  async getSecurityPermissions(): Promise<SecurityPermission[]> {
    const { data } = await this.client.get<SecurityPermission[]>('/security/permissions');
    return data;
  }

  async getRoles(): Promise<SecurityRole[]> {
    const { data } = await this.client.get<SecurityRole[]>('/security/roles');
    return data;
  }

  async getRole(key: string): Promise<SecurityRole> {
    const { data } = await this.client.get<SecurityRole>(`/security/roles/${key}`);
    return data;
  }

  async createRole(dto: CreateRoleDto): Promise<SecurityRole> {
    const { data } = await this.client.post<SecurityRole>('/security/roles', dto);
    return data;
  }

  async updateRole(key: string, dto: UpdateRoleDto): Promise<SecurityRole> {
    const { data } = await this.client.put<SecurityRole>(`/security/roles/${key}`, dto);
    return data;
  }

  async deleteRole(key: string): Promise<void> {
    await this.client.delete(`/security/roles/${key}`);
  }

  // --- Auditoría de negocio (workflow_events) ------------------------------

  async getAuditLog(limit = 100): Promise<WorkflowEvent[]> {
    const { data } = await this.client.get<WorkflowEvent[]>('/auditoria', { params: { limit } });
    return data;
  }

  async getEntityAuditLog(entityType: string, entityId: string): Promise<WorkflowEvent[]> {
    const { data } = await this.client.get<WorkflowEvent[]>(`/auditoria/${entityType}/${entityId}`);
    return data;
  }
}

export const api = new ApiClient();
