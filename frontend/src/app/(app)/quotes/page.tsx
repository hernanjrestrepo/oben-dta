'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Quote } from '@/types';
import { Plus, Search, Loader2, AlertCircle, ArrowRight } from 'lucide-react';

const statusLabels: Record<string, string> = {
  RECEIVED: 'Recibida',
  PARSING: 'Procesando',
  QUOTED: 'Cotizada',
  SENT: 'Enviada',
  APPROVED: 'Aprobada',
  ORDERED: 'Convertida a Orden',
  PAYMENT_PENDING: 'Pago Pendiente',
  PAID: 'Pagada',
  IN_PRODUCTION: 'En Producción',
  READY_FOR_DELIVERY: 'Lista para Entrega',
  DELIVERED: 'Entregada',
  REJECTED: 'Rechazada',
};

const statusColors: Record<string, string> = {
  RECEIVED: 'bg-gray-100 text-gray-700',
  PARSING: 'bg-gray-100 text-gray-700',
  QUOTED: 'bg-yellow-100 text-yellow-700',
  SENT: 'bg-indigo-100 text-indigo-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  ORDERED: 'bg-blue-100 text-blue-700',
  PAYMENT_PENDING: 'bg-orange-100 text-orange-700',
  PAID: 'bg-teal-100 text-teal-700',
  IN_PRODUCTION: 'bg-purple-100 text-purple-700',
  READY_FOR_DELIVERY: 'bg-cyan-100 text-cyan-700',
  DELIVERED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadQuotes();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return quotes;
    const q = search.toLowerCase();
    return quotes.filter(
      (quote) =>
        quote.quoteNumber.toLowerCase().includes(q) ||
        quote.client?.name?.toLowerCase().includes(q) ||
        statusLabels[quote.status]?.toLowerCase().includes(q),
    );
  }, [search, quotes]);

  async function loadQuotes() {
    try {
      setLoading(true);
      setError('');
      const data = await api.getQuotes();
      setQuotes(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Error cargando cotizaciones');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cotizaciones</h1>
          <p className="text-gray-500 mt-1">Pipeline correo → cotización → pago → producción → entrega</p>
        </div>
        <Link
          href="/quotes/new"
          className="inline-flex items-center gap-2 bg-[#003366] hover:bg-[#004080] text-white px-4 py-2.5 rounded-lg font-medium transition"
        >
          <Plus className="w-5 h-5" />
          Nueva Solicitud de Cotización
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por número, cliente o estado..."
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
                onClick={loadQuotes}
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
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Cotización</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Cliente</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Total</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Estado</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Fecha</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length ? (
                  filtered.map((quote) => (
                    <tr key={quote.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4">
                        <Link
                          href={`/quotes/${quote.id}`}
                          className="font-medium text-[#003366] hover:underline"
                        >
                          {quote.quoteNumber}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-gray-700">
                        {quote.client?.name || '—'}
                      </td>
                      <td className="px-6 py-4 font-semibold text-gray-900">
                        ${Number(quote.total).toLocaleString('es-CO')} COP
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                            statusColors[quote.status] || 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {statusLabels[quote.status] || quote.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {new Date(quote.createdAt).toLocaleDateString('es-CO')}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/quotes/${quote.id}`}
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
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                      {search.trim()
                        ? 'No se encontraron resultados'
                        : 'No hay cotizaciones registradas — simula un correo entrante para iniciar el pipeline'}
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
