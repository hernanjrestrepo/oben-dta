'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Package, Search, Loader2, AlertCircle, Info } from 'lucide-react';

export default function ListaEmpaquePage() {
  const [orderNumber, setOrderNumber] = useState('');
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSearch() {
    if (!orderNumber.trim()) return;
    try {
      setLoading(true);
      setError('');
      setData(null);
      const result = await api.getPackingList(orderNumber.trim());
      setData(result);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'No se pudo consultar la lista de empaque en el ERP de Oben');
    } finally {
      setLoading(false);
    }
  }

  const summaryFields = data
    ? Object.entries(data).filter(([k, v]) => k !== 'DetailedPackingList' && (typeof v === 'string' || typeof v === 'number'))
    : [];
  const lines = (data?.DetailedPackingList as Record<string, unknown>[] | undefined) ?? [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Package className="w-6 h-6 text-[#F47735]" />
          Lista de Empaque
        </h1>
        <p className="text-gray-500 mt-1">
          Consulta en vivo al ERP real de Oben — datos exactos del embarque, no estimados.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-2">
        <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800">
          Esta consulta requiere el <b>número de orden de venta real en el sistema de Oben</b> (no el número de nuestra plataforma). Aplica hoy a órdenes que ya existen en su ERP.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center gap-3">
        <input
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Número de orden de venta en Oben, ej: 10794"
          className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F47735] focus:border-[#F47735] outline-none"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !orderNumber.trim()}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg font-medium transition disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Consultar
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {data && (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Resumen</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {summaryFields.map(([k, v]) => (
                <div key={k}>
                  <p className="text-xs text-gray-500 uppercase">{k}</p>
                  <p className="font-medium text-gray-900">{String(v) || '—'}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                Detalle ({lines.length} líneas)
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                {lines.length > 0 && (
                  <>
                    <thead>
                      <tr className="bg-gray-50">
                        {Object.keys(lines[0]).map((col) => (
                          <th key={col} className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lines.map((line, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          {Object.values(line).map((val, j) => (
                            <td key={j} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                              {String(val ?? '—')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}
              </table>
              {lines.length === 0 && (
                <p className="px-6 py-8 text-center text-gray-400">Sin líneas de detalle</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
