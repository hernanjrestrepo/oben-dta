'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Quote } from '@/types';
import { getQuoteEmailId } from '@/lib/quoteEmailMap';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  User,
  Tag,
  Package,
  RefreshCw,
  FileDown,
  Link as LinkIcon,
} from 'lucide-react';

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

export default function QuoteDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (id) loadQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadQuote() {
    try {
      setLoading(true);
      setError('');
      const data = await api.getQuote(id);
      setQuote(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Error cargando la cotización');
    } finally {
      setLoading(false);
    }
  }

  async function runAction(action: () => Promise<Quote>) {
    setActionError('');
    try {
      setActing(true);
      const updated = await action();
      setQuote(updated);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setActionError(msg || 'Error ejecutando la acción');
    } finally {
      setActing(false);
    }
  }

  function requireEmailId(): string | null {
    if (!quote) return null;
    const emailId = getQuoteEmailId(quote.id);
    if (!emailId) {
      setActionError(
        'No se encontró el correo original de esta cotización en esta sesión del navegador (el simulador de correo no persiste entre reinicios del backend). Simula una nueva cotización desde "Simular Correo Entrante" para probar el flujo de aprobación.',
      );
      return null;
    }
    return emailId;
  }

  async function handleDownloadPdf() {
    if (!quote) return;
    try {
      setActing(true);
      const blob = await api.downloadQuotePdf(quote.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch {
      setActionError('Error descargando el PDF');
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-[#F47735] animate-spin" />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <p className="text-red-600 font-medium">{error || 'Cotización no encontrada'}</p>
          <div className="flex items-center justify-center gap-3 mt-4">
            <button onClick={loadQuote} className="text-[#F47735] hover:underline">
              Reintentar
            </button>
            <Link href="/quotes" className="text-gray-500 hover:underline">
              Volver a cotizaciones
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/quotes"
            className="p-2 text-gray-500 hover:text-[#F47735] hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{quote.quoteNumber}</h1>
            <span
              className={`inline-flex mt-1 px-3 py-1 rounded-full text-xs font-semibold ${statusColors[quote.status]}`}
            >
              {statusLabels[quote.status]}
            </span>
          </div>
        </div>

        <button
          onClick={loadQuote}
          disabled={acting}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${acting ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {actionError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{actionError}</p>
        </div>
      )}

      {/* Pipeline Actions */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Pipeline de la Cotización</h2>
        <div className="flex flex-wrap gap-3">
          {quote.status === 'QUOTED' && (
            <button
              disabled={acting}
              onClick={() => runAction(() => api.generateQuotePdf(quote.id))}
              className="px-4 py-2 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg font-medium transition disabled:opacity-60"
            >
              Generar y Enviar PDF
            </button>
          )}

          {quote.status === 'SENT' && (
            <>
              <button
                disabled={acting}
                onClick={() => {
                  const emailId = requireEmailId();
                  if (emailId) runAction(() => api.approveQuote(quote.id, emailId));
                }}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition disabled:opacity-60"
              >
                Registrar Aprobación del Cliente
              </button>
              <button
                disabled={acting}
                onClick={() => {
                  const emailId = requireEmailId();
                  if (emailId) runAction(() => api.rejectQuote(quote.id, emailId));
                }}
                className="px-4 py-2 border border-red-300 text-red-600 hover:bg-red-50 rounded-lg font-medium transition disabled:opacity-60"
              >
                Registrar Rechazo del Cliente
              </button>
            </>
          )}

          {quote.status === 'APPROVED' && (
            <button
              disabled={acting}
              onClick={() => runAction(() => api.createQuotePaymentLink(quote.id))}
              className="px-4 py-2 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg font-medium transition disabled:opacity-60"
            >
              Generar Link de Pago
            </button>
          )}

          {quote.status === 'PAYMENT_PENDING' && (
            <button
              disabled={acting}
              onClick={() => runAction(() => api.simulateQuotePayment(quote.id))}
              className="px-4 py-2 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg font-medium transition disabled:opacity-60"
            >
              Confirmar Pago Recibido
            </button>
          )}

          {quote.status === 'PAID' && (
            <button
              disabled={acting}
              onClick={() => runAction(() => api.moveQuoteToProduction(quote.id))}
              className="px-4 py-2 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg font-medium transition disabled:opacity-60"
            >
              Mover a Producción
            </button>
          )}

          {quote.status === 'IN_PRODUCTION' && (
            <button
              disabled={acting}
              onClick={() => runAction(() => api.markQuoteReady(quote.id))}
              className="px-4 py-2 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg font-medium transition disabled:opacity-60"
            >
              Marcar Lista para Entrega
            </button>
          )}

          {quote.status === 'READY_FOR_DELIVERY' && (
            <button
              disabled={acting}
              onClick={() => runAction(() => api.markQuoteDelivered(quote.id))}
              className="px-4 py-2 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg font-medium transition disabled:opacity-60"
            >
              Marcar Entregada
            </button>
          )}

          {(quote.status === 'DELIVERED' || quote.status === 'REJECTED') && (
            <p className="text-sm text-gray-500">
              {quote.status === 'DELIVERED' ? 'Pipeline completado — entregada al cliente.' : 'Cotización rechazada.'}
            </p>
          )}

          {quote.pdfUrl && (
            <button
              disabled={acting}
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition disabled:opacity-60"
            >
              <FileDown className="w-4 h-4" />
              Descargar PDF
            </button>
          )}

          {quote.paymentLink && (
            <a
              href={quote.paymentLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
            >
              <LinkIcon className="w-4 h-4" />
              Ver Link de Pago
            </a>
          )}
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-[#F47735]" />
            Cliente
          </h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500 uppercase">Nombre</p>
              <p className="font-medium text-gray-900">{quote.client?.name || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Correo</p>
              <p className="text-gray-700">{quote.client?.email || '—'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Tag className="w-5 h-5 text-[#F47735]" />
            Información
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">Creada</span>
              <span className="text-gray-700">{new Date(quote.createdAt).toLocaleString('es-CO')}</span>
            </div>
            {quote.approvedAt && (
              <div className="flex justify-between">
                <span className="text-gray-500">Aprobada</span>
                <span className="text-gray-700">{new Date(quote.approvedAt).toLocaleString('es-CO')}</span>
              </div>
            )}
            {quote.paidAt && (
              <div className="flex justify-between">
                <span className="text-gray-500">Pagada</span>
                <span className="text-gray-700">{new Date(quote.paidAt).toLocaleString('es-CO')}</span>
              </div>
            )}
            {quote.deliveredAt && (
              <div className="flex justify-between">
                <span className="text-gray-500">Entregada</span>
                <span className="text-gray-700">{new Date(quote.deliveredAt).toLocaleString('es-CO')}</span>
              </div>
            )}
            {quote.invoiceNumber && (
              <div className="flex justify-between">
                <span className="text-gray-500">Factura</span>
                <span className="text-gray-700">{quote.invoiceNumber}</span>
              </div>
            )}
            {quote.notes && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-600 font-semibold">Notas:</p>
                <p className="text-sm text-blue-700">{quote.notes}</p>
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
              {quote.items?.length ? (
                quote.items.map((item) => (
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
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                    Sin productos
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={4} className="px-6 py-3 text-right text-gray-600">Subtotal</td>
                <td className="px-6 py-3 text-right font-medium">
                  ${Number(quote.subtotal).toLocaleString('es-CO')} COP
                </td>
              </tr>
              <tr>
                <td colSpan={4} className="px-6 py-3 text-right text-gray-600">IVA</td>
                <td className="px-6 py-3 text-right font-medium">
                  ${Number(quote.taxAmount).toLocaleString('es-CO')} COP
                </td>
              </tr>
              <tr>
                <td colSpan={4} className="px-6 py-4 text-right font-semibold text-gray-700">
                  Total:
                </td>
                <td className="px-6 py-4 text-right font-bold text-[#F47735] text-lg">
                  ${Number(quote.total).toLocaleString('es-CO')} COP
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
