'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Invoice, InvoiceStatus } from '@/types';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  FileText,
  Tag,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';

const statusLabels: Record<InvoiceStatus, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  SENT: 'Enviada',
  PAID: 'Pagada',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

const statusColors: Record<InvoiceStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  SENT: 'bg-indigo-100 text-indigo-700',
  PAID: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

const dianStatusLabels: Record<string, string> = {
  PENDING: 'Pendiente',
  ACCEPTED: 'Aceptada',
  REJECTED: 'Rechazada',
};

export default function InvoiceDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  useEffect(() => {
    if (id) loadInvoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadInvoice() {
    try {
      setLoading(true);
      setError('');
      const data = await api.getInvoice(id);
      setInvoice(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Error cargando la factura');
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(newStatus: InvoiceStatus) {
    if (!invoice) return;
    try {
      setUpdating(true);
      setShowStatusMenu(false);
      const updated = await api.updateInvoiceStatus(invoice.id, { status: newStatus });
      setInvoice(updated);
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
        <Loader2 className="w-8 h-8 text-[#003366] animate-spin" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <p className="text-red-600 font-medium">{error || 'Factura no encontrada'}</p>
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={loadInvoice}
              className="text-[#003366] hover:underline"
            >
              Reintentar
            </button>
            <Link href="/invoices" className="text-gray-500 hover:underline">
              Volver a facturas
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const validTransitions: Record<InvoiceStatus, InvoiceStatus[]> = {
    PENDING: ['APPROVED', 'CANCELLED'],
    APPROVED: ['SENT', 'CANCELLED'],
    SENT: ['PAID', 'OVERDUE', 'CANCELLED'],
    OVERDUE: ['PAID', 'CANCELLED'],
    PAID: [],
    CANCELLED: [],
  };

  const nextStatuses = validTransitions[invoice.status] || [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/invoices"
            className="p-2 text-gray-500 hover:text-[#003366] hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{invoice.invoiceNumber}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                  statusColors[invoice.status]
                }`}
              >
                {statusLabels[invoice.status]}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadInvoice}
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
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#003366] hover:bg-[#004080] text-white rounded-lg font-medium transition disabled:opacity-60"
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
        {/* Order/Client Info */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#003366]" />
            Orden y Cliente
          </h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500 uppercase">Orden</p>
              {invoice.order ? (
                <Link
                  href={`/orders/${invoice.order.id}`}
                  className="font-medium text-[#003366] hover:underline"
                >
                  {invoice.order.orderNumber}
                </Link>
              ) : (
                <p className="font-medium text-gray-900">—</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Cliente</p>
              <p className="text-gray-700">{invoice.order?.client?.name || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Correo</p>
              <p className="text-gray-700">{invoice.order?.client?.email || '—'}</p>
            </div>
          </div>
        </div>

        {/* Invoice Info */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Tag className="w-5 h-5 text-[#003366]" />
            Información
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">Emitida</span>
              <span className="text-gray-700">{new Date(invoice.createdAt).toLocaleString('es-CO')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Vencimiento</span>
              <span className="text-gray-700">
                {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('es-CO') : '—'}
              </span>
            </div>
            {invoice.paidAt && (
              <div className="flex justify-between">
                <span className="text-gray-500">Pagada el</span>
                <span className="text-gray-700">{new Date(invoice.paidAt).toLocaleString('es-CO')}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Estado DIAN</span>
              <span className="text-gray-700">{dianStatusLabels[invoice.dianStatus] || invoice.dianStatus}</span>
            </div>
            {invoice.dianCufe && (
              <div>
                <p className="text-xs text-gray-500 uppercase">CUFE</p>
                <p className="text-gray-700 font-mono text-xs break-all">{invoice.dianCufe}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Amounts */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Montos</h2>
        </div>
        <div className="divide-y divide-gray-100">
          <div className="flex justify-between px-6 py-4">
            <span className="text-gray-500">Subtotal</span>
            <span className="text-gray-900 font-medium">
              ${Number(invoice.amount).toLocaleString('es-CO')} COP
            </span>
          </div>
          <div className="flex justify-between px-6 py-4">
            <span className="text-gray-500">IVA</span>
            <span className="text-gray-900 font-medium">
              ${Number(invoice.taxAmount).toLocaleString('es-CO')} COP
            </span>
          </div>
          <div className="flex justify-between px-6 py-4 bg-gray-50">
            <span className="font-semibold text-gray-700">Total</span>
            <span className="font-bold text-[#003366] text-lg">
              ${Number(invoice.totalAmount).toLocaleString('es-CO')} COP
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
