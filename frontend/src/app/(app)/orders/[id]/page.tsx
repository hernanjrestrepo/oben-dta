'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Order, OrderStatus } from '@/types';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Package,
  User,
  Tag,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';

const statusLabels: Record<OrderStatus, string> = {
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

const statusColors: Record<OrderStatus, string> = {
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

export default function OrderDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  useEffect(() => {
    if (id) loadOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadOrder() {
    try {
      setLoading(true);
      setError('');
      const data = await api.getOrder(id);
      setOrder(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Error cargando la orden');
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(newStatus: OrderStatus) {
    if (!order) return;
    try {
      setUpdating(true);
      setShowStatusMenu(false);
      const updated = await api.updateOrderStatus(order.id, { status: newStatus });
      setOrder(updated);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      alert(msg || 'Error actualizando estado');
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-[#F47735] animate-spin" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <p className="text-red-600 font-medium">{error || 'Orden no encontrada'}</p>
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={loadOrder}
              className="text-[#F47735] hover:underline"
            >
              Reintentar
            </button>
            <Link href="/orders" className="text-gray-500 hover:underline">
              Volver a órdenes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const validTransitions: Record<OrderStatus, OrderStatus[]> = {
    DRAFT: ['PENDING_VALIDATION', 'CANCELLED'],
    PENDING_VALIDATION: ['CONFIRMED', 'BLOCKED', 'CANCELLED'],
    CONFIRMED: ['PENDING_PRODUCTION', 'READY_FOR_DELIVERY', 'CANCELLED'],
    PENDING_PRODUCTION: ['IN_PRODUCTION', 'CANCELLED'],
    IN_PRODUCTION: ['READY_FOR_DELIVERY'],
    READY_FOR_DELIVERY: ['DELIVERED'],
    DELIVERED: [],
    BLOCKED: ['PENDING_VALIDATION', 'CANCELLED'],
    CANCELLED: [],
  };

  const nextStatuses = validTransitions[order.status] || [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/orders"
            className="p-2 text-gray-500 hover:text-[#F47735] hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{order.orderNumber}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                  statusColors[order.status]
                }`}
              >
                {statusLabels[order.status]}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadOrder}
            disabled={updating}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${updating ? 'animate-spin' : ''}`} />
            Actualizar
          </button>

          {nextStatuses.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                disabled={updating}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg font-medium transition disabled:opacity-60"
              >
                Cambiar Estado
                <ChevronDown className="w-4 h-4" />
              </button>

              {showStatusMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
                  {nextStatuses.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 transition text-sm"
                    >
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold mr-2 ${
                          statusColors[s]
                        }`}
                      >
                        {statusLabels[s]}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Client Info */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-[#F47735]" />
            Cliente
          </h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500 uppercase">Nombre</p>
              <p className="font-medium text-gray-900">{order.client?.name || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Correo</p>
              <p className="text-gray-700">{order.client?.email || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Teléfono</p>
              <p className="text-gray-700">{order.client?.phone || '—'}</p>
            </div>
          </div>
        </div>

        {/* Order Info */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Tag className="w-5 h-5 text-[#F47735]" />
            Información
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">Creada</span>
              <span className="text-gray-700">{new Date(order.createdAt).toLocaleString('es-CO')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Actualizada</span>
              <span className="text-gray-700">{new Date(order.updatedAt).toLocaleString('es-CO')}</span>
            </div>
            {order.validatedBy && (
              <div className="flex justify-between">
                <span className="text-gray-500">Validada por</span>
                <span className="text-gray-700">{order.validatedBy}</span>
              </div>
            )}
            {order.blockedReason && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs text-red-600 font-semibold">Razón de bloqueo:</p>
                <p className="text-sm text-red-700">{order.blockedReason}</p>
              </div>
            )}
            {order.notes && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-600 font-semibold">Notas:</p>
                <p className="text-sm text-blue-700">{order.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-[#F47735]" />
            Productos
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left font-semibold text-gray-600">Producto</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-600">SKU</th>
                <th className="px-6 py-3 text-right font-semibold text-gray-600">Cant.</th>
                <th className="px-6 py-3 text-right font-semibold text-gray-600">Precio Unit.</th>
                <th className="px-6 py-3 text-right font-semibold text-gray-600">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {order.items?.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{item.product?.name || '—'}</td>
                  <td className="px-6 py-4 text-gray-600 font-mono text-xs">{item.product?.sku || '—'}</td>
                  <td className="px-6 py-4 text-right">{item.quantity}</td>
                  <td className="px-6 py-4 text-right">
                    ${Number(item.unitPrice).toLocaleString('es-CO')} COP
                  </td>
                  <td className="px-6 py-4 text-right font-medium">
                    ${Number(item.totalPrice).toLocaleString('es-CO')} COP
                  </td>
                </tr>
              )) || (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                    Sin productos
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={4} className="px-6 py-4 text-right font-semibold text-gray-700">
                  Total:
                </td>
                <td className="px-6 py-4 text-right font-bold text-[#F47735] text-lg">
                  ${Number(order.totalAmount).toLocaleString('es-CO')} COP
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
