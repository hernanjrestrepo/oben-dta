// API Types for Oben-DTA Frontend

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: User;
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
