'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Order } from '@/types';
import {
  Plus,
  Search,
  Loader2,
  AlertCircle,
  ArrowRight,
  Trash2,
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

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadOrders();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.toLowerCase();
    return orders.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.client?.name?.toLowerCase().includes(q) ||
        statusLabels[o.status]?.toLowerCase().includes(q),
    );
  }, [search, orders]);

  async function loadOrders() {
    try {
      setLoading(true);
      setError('');
      const data = await api.getOrders();
      setOrders(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Error cargando órdenes');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta orden? Esta acción no se puede deshacer.')) return;
    try {
      setDeleting(id);
      await api.deleteOrder(id);
      setOrders((prev) => prev.filter((o) => o.id !== id));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      alert(msg || 'Error eliminando orden');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Órdenes</h1>
          <p className="text-gray-500 mt-1">Gestiona órdenes de exportación</p>
        </div>
        <Link
          href="/orders/new"
          className="inline-flex items-center gap-2 bg-[#003366] hover:bg-[#004080] text-white px-4 py-2.5 rounded-lg font-medium transition"
        >
          <Plus className="w-5 h-5" />
          Nueva Orden
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por número de orden, cliente o estado..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003366] focus:border-[#003366] outline-none transition"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#003366] animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-2" />
              <p className="text-red-600">{error}</p>
              <button
                onClick={loadOrders}
                className="mt-3 text-[#003366] hover:underline"
              >
                Reintentar
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Orden</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Cliente</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Total</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Estado</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Fecha</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length ? (
                  filtered.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4">
                        <Link
                          href={`/orders/${order.id}`}
                          className="font-medium text-[#003366] hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-gray-700">
                        {order.client?.name || '—'}
                      </td>
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
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/orders/${order.id}`}
                            className="p-2 text-[#003366] hover:bg-blue-50 rounded-lg transition"
                            title="Ver detalle"
                          >
                            <ArrowRight className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => handleDelete(order.id)}
                            disabled={deleting === order.id}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                            title="Eliminar"
                          >
                            {deleting === order.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                      {search.trim() ? 'No se encontraron resultados' : 'No hay órdenes registradas'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
