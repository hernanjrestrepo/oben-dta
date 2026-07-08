'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import { AuditRow } from '@/types';
import { Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';

export default function AuditPage() {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ permissionKey: '', granted: '' });

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function load() {
    try {
      setLoading(true);
      setError('');
      const data = await api.getAudit({
        page,
        pageSize,
        permissionKey: filters.permissionKey || undefined,
        granted: filters.granted || undefined,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (err: unknown) {
      setError(extractMessage(err, 'Error cargando auditoría'));
    } finally {
      setLoading(false);
    }
  }

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load();
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Auditoría</h1>
        <p className="text-gray-500 mt-1">Trazabilidad completa de decisiones de autorización ({total} registros)</p>
      </div>

      <form onSubmit={applyFilters} className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Permiso</label>
          <input
            value={filters.permissionKey}
            onChange={(e) => setFilters({ ...filters, permissionKey: e.target.value })}
            placeholder="platform.users.read"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Resultado</label>
          <select
            value={filters.granted}
            onChange={(e) => setFilters({ ...filters, granted: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          >
            <option value="">Todos</option>
            <option value="true">Permitido</option>
            <option value="false">Denegado</option>
          </select>
        </div>
        <button type="submit" className="bg-gray-900 hover:bg-gray-800 text-white font-semibold px-4 py-2 rounded-lg text-sm">Filtrar</button>
      </form>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-gray-700 animate-spin" /></div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Fecha</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Permiso</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Ruta</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Usuario</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Tenant</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin registros</td></tr>
                ) : (
                  items.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(row.createdAt).toLocaleString('es-CO')}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{row.permissionKey}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{row.method} {row.route}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-mono">{row.userId?.slice(0, 8) ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-mono">{row.tenantId?.slice(0, 8) ?? 'plataforma'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${row.granted ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {row.granted ? 'Permitido' : row.deniedReason ?? 'Denegado'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm text-gray-500">
            <span>Página {page} de {totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="p-1.5 rounded disabled:opacity-30 hover:bg-gray-100"><ChevronLeft className="w-4 h-4" /></button>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="p-1.5 rounded disabled:opacity-30 hover:bg-gray-100"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
