import axios, { AxiosError, AxiosInstance } from 'axios';
import { ApiError, AuthResponse, Client, CreateOrderDto, DashboardKPIs, Order, Product, UpdateOrderStatusDto, User } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:3004';

class ApiClient {
  private client: AxiosInstance;

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

    // Response interceptor — handle 401 and token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<ApiError>) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && originalRequest) {
          // Token expired or invalid — clear auth and redirect
          this.clearAuth();
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        }

        return Promise.reject(error);
      },
    );
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
    // The Next.js middleware (src/middleware.ts) gates protected routes by
    // looking for an `access_token` cookie. The API client authenticates via
    // the Authorization header from localStorage, so without also writing the
    // cookie the middleware bounces every post-login navigation back to
    // /login. Keep the cookie in sync with the stored token.
    if (typeof document !== 'undefined') {
      document.cookie = `access_token=${response.access_token}; path=/; max-age=900; SameSite=Lax`;
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

  async deleteClient(id: string): Promise<void> {
    await this.client.delete(`/clients/${id}`);
  }

  // Products (for order creation)
  async getProducts(): Promise<Product[]> {
    const { data } = await this.client.get<Product[]>('/products');
    return data;
  }
}

export const api = new ApiClient();
