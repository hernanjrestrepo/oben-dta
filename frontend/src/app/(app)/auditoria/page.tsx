'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { WorkflowEvent } from '@/types';
import { Fragment } from 'react';
import { Loader2, AlertCircle, History, ChevronDown, ChevronUp } from 'lucide-react';

const ACTION_LABELS: Record<string, string> = {
  email_received: 'Correo recibido',
  client_created: 'Cliente creado',
  client_matched: 'Cliente identificado',
  quote_generated: 'Cotización generada',
  pdf_generated: 'PDF generado',
  email_sent: 'Correo de respuesta enviado',
  quote_approved: 'Cotización aprobada',
  quote_rejected_client: 'Cotización rechazada por el cliente',
  quote_rejected_credit: 'Cotización rechazada por cartera insuficiente',
  payment_link_created: 'Link de pago generado',
  payment_confirmed: 'Pago confirmado',
  moved_to_production: 'Movida a producción',
  marked_ready: 'Marcada lista para entrega',
  marked_delivered: 'Marcada entregada',
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

export default function AuditoriaPage() {
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      setError('');
      const data = await api.getAuditLog(200);
      setEvents(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Error cargando la auditoría');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-[#003366] flex items-center justify-center shrink-0">
          <History className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Auditoría</h1>
          <p className="text-gray-500 mt-1">Trazabilidad de eventos de negocio del tenant</p>
        </div>
      </div>

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
              <button onClick={load} className="mt-3 text-[#003366] hover:underline">Reintentar</button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Fecha</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Flujo</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Acción</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Entidad</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Estado</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-600">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {events.length ? (
                  events.map((ev) => (
                    <Fragment key={ev.id}>
                      <tr className="hover:bg-gray-50 transition">
                        <td className="px-6 py-3 text-gray-500 whitespace-nowrap">
                          {new Date(ev.createdAt).toLocaleString('es-CO')}
                        </td>
                        <td className="px-6 py-3 text-gray-700">{ev.workflowName}</td>
                        <td className="px-6 py-3 font-medium text-gray-900">
                          {ACTION_LABELS[ev.action] || ev.action}
                        </td>
                        <td className="px-6 py-3 text-gray-600">
                          {ev.entityType} <span className="font-mono text-xs text-gray-400">#{ev.entityId.slice(0, 8)}</span>
                        </td>
                        <td className="px-6 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[ev.status] || 'bg-gray-100 text-gray-500'}`}>
                            {ev.status}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right">
                          <button
                            onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition"
                          >
                            {expanded === ev.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>
                      {expanded === ev.id && (
                        <tr>
                          <td colSpan={6} className="px-6 py-3 bg-gray-50">
                            <pre className="text-xs text-gray-600 whitespace-pre-wrap break-all">
                              {JSON.stringify({ inputData: ev.inputData, outputData: ev.outputData, reason: ev.reason }, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                      No hay eventos registrados todavía
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
