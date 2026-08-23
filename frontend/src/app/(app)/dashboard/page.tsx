'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { DashboardKPIs, Order } from '@/types';
import {
  ShoppingCart,
  Users,
  DollarSign,
  Package,
  ArrowRight,
  Loader2,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';

const statusLabels: Record<string, string> = {
  DRAFT: 'Borrador',
  PENDING_VALIDATION: 'Pendiente Validación',
  CONFIRMED: 'Confirmada',
  PENDING_PRODUCTION: 'Pendiente Producción',
  IN_PRODUCTION: 'En Producción',
  READY_FOR_DELIVERY: 'Lista para Entrega',
  DELIVERED: 'Entregada',
  BLOCKED: 'Bloqueada',
  CANCELLED: 'Cancelada',
};

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING_VALIDATION: 'bg-yellow-100 text-yellow-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  PENDING_PRODUCTION: 'bg-indigo-100 text-indigo-700',
  IN_PRODUCTION: 'bg-orange-100 text-orange-700',
  READY_FOR_DELIVERY: 'bg-purple-100 text-purple-700',
  DELIVERED: 'bg-green-100 text-green-700',
  BLOCKED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

export default function DashboardPage() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      setLoading(true);
      setError('');
      const data = await api.getDashboardKPIs();
      setKpis(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Error cargando el dashboard');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-[#F47735] animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <p className="text-red-600 font-medium">{error}</p>
          <button
            onClick={loadDashboard}
            className="mt-4 text-[#F47735] hover:underline"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Resumen de operaciones y métricas clave</p>
      </div>

      {/* KPI Cards */}
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <KPICard
            title="Total Órdenes"
            value={kpis?.totalOrders ?? 0}
            icon={ShoppingCart}
            color="bg-[#F47735]"
          />
          <KPICard
            title="Órdenes Activas"
            value={kpis?.activeOrders ?? 0}
            icon={Package}
            color="bg-[#009966]"
          />
          <KPICard
            title="Total Clientes"
            value={kpis?.totalClients ?? 0}
            icon={Users}
            color="bg-[#FF6600]"
          />
          <KPICard
            title="Ingresos Totales"
            value={`$${(kpis?.totalRevenue ?? 0).toLocaleString('es-CO')} COP`}
            icon={DollarSign}
            color="bg-[#E5641F]"
          />
        </div>

        {/* Status Breakdown */}
        <>
          <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#F47735]" />
            Órdenes por Estado
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {Object.entries(kpis?.ordersByStatus ?? {}).map(([status, count]) => (
              <div
                key={status}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-200"
              >
                <p className="text-xs text-gray-500 uppercase">{statusLabels[status] || status}</p>
                <p className="text-2xl font-bold text-[#F47735] mt-1">{count}</p>
              </div>
            ))}
          </div>
        </>

        {/* Recent Orders */}
        <>
          <div className="flex items-center justify-between mt-8 mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Órdenes Recientes</h2>
            <Link
              href="/orders"
              className="text-sm text-[#F47735] hover:underline flex items-center gap-1"
            >
              Ver todas
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-6 py-3 text-left font-semibold text-gray-600">Orden</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-600">Cliente</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-600">Total</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-600">Estado</th>
                    <th className="px-6 py-3 text-left font-semibold text-gray-600">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {kpis?.recentOrders?.length ? (
                    kpis.recentOrders.map((order) => (
                      <OrderRow key={order.id} order={order} />
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                        No hay órdenes registradas
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      </>
    </div>
  );
}

function KPICard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`w-12 h-12 ${color} rounded-lg flex items-center justify-center`
        }>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
}

function OrderRow({ order }: { order: Order }) {
  return (
    <tr className="hover:bg-gray-50 transition">
      <td className="px-6 py-4">
        <Link
          href={`/orders/${order.id}`}
          className="font-medium text-[#F47735] hover:underline"
        >
          {order.orderNumber}
        </Link>
      </td>
      <td className="px-6 py-4 text-gray-700">{order.client?.name || '—'}</td>
      <td className="px-6 py-4 font-semibold text-gray-900">
        ${Number(order.totalAmount).toLocaleString('es-CO')} COP
      </td>
      <td className="px-6 py-4">
        <span
          className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
            statusColors[order.status] || 'bg-gray-100 text-gray-700'
          }`}
        >
          {statusLabels[order.status] || order.status}
        </span>
      </td>
      <td className="px-6 py-4 text-gray-500">
        {new Date(order.createdAt).toLocaleDateString('es-CO')}
      </td>
    </tr>
  );
}
