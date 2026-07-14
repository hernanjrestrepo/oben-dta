'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Invoice } from '@/types';
import { Search, Loader2, AlertCircle, ArrowRight } from 'lucide-react';

const statusLabels: Record<string, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  SENT: 'Enviada',
  PAID: 'Pagada',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  SENT: 'bg-indigo-100 text-indigo-700',
  PAID: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadInvoices();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return invoices;
    const q = search.toLowerCase();
    return invoices.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.order?.orderNumber?.toLowerCase().includes(q) ||
        inv.order?.client?.name?.toLowerCase().includes(q) ||
        statusLabels[inv.status]?.toLowerCase().includes(q),
    );
  }, [search, invoices]);

  async function loadInvoices() {
    try {
      setLoading(true);
      setError('');
      const data = await api.getInvoices();
      setInvoices(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Error cargando facturas');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturas</h1>
          <p className="text-gray-500 mt-1">Gestiona la facturación de órdenes</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por número de factura, orden, cliente o estado..."
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
                onClick={loadInvoices}
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
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Factura</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Orden</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Cliente</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Total</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Estado</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Vencimiento</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length ? (
                  filtered.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="font-medium text-[#003366] hover:underline"
                        >
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-gray-700">
                        {inv.order?.orderNumber || '—'}
                      </td>
                      <td className="px-6 py-4 text-gray-700">
                        {inv.order?.client?.name || '—'}
                      </td>
                      <td className="px-6 py-4 font-semibold text-gray-900">
                        ${Number(inv.totalAmount).toLocaleString('es-CO')} COP
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                            statusColors[inv.status] || 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {statusLabels[inv.status] || inv.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('es-CO') : '—'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="inline-flex p-2 text-[#003366] hover:bg-blue-50 rounded-lg transition"
                          title="Ver detalle"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                      {search.trim() ? 'No se encontraron resultados' : 'No hay facturas registradas'}
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
