'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import type { Client, Equivalence } from '@/types';
import { ImportPanel } from '@/components/ImportPanel';
import { AlertCircle, ArrowRightLeft, Check, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';

/**
 * Tabla de equivalencias cliente↔producto (reunión 2026-09-23, 22:33: "esa
 * tabla va a tener un formulario para que pueda crear nuevas equivalencias o
 * editar las que ya existen"). Es la que usa la lectura automática de las
 * órdenes de compra: una línea sin equivalencia nunca recibe una referencia
 * Oben adivinada.
 */
export default function EquivalenciasPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState('');
  const [rows, setRows] = useState<Equivalence[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ clientCode: '', obenCode: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ id: string; clientCode: string; obenCode: string; description: string } | null>(null);

  useEffect(() => {
    api.getClients().then(setClients).catch((err) => setError(extractMessage(err, 'No se pudieron cargar los clientes.')));
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function load() {
    try {
      setLoading(true);
      setError('');
      setRows(await api.getEquivalences(clientId || undefined));
    } catch (err) {
      setError(extractMessage(err, 'No se pudieron cargar las equivalencias.'));
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.clientCode, r.obenCode, r.description ?? '', r.client?.name ?? ''].some((v) => v.toLowerCase().includes(q)));
  }, [rows, search]);

  async function add() {
    if (!clientId || !form.clientCode.trim() || !form.obenCode.trim()) return;
    try {
      setSaving(true);
      setError('');
      await api.createEquivalence({ clientId, clientCode: form.clientCode.trim(), obenCode: form.obenCode.trim(), ...(form.description.trim() ? { description: form.description.trim() } : {}) });
      setForm({ clientCode: '', obenCode: '', description: '' });
      await load();
    } catch (err) {
      setError(extractMessage(err, 'No se pudo guardar la equivalencia.'));
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      setSaving(true);
      await api.updateEquivalence(editing.id, { clientCode: editing.clientCode.trim(), obenCode: editing.obenCode.trim(), description: editing.description });
      setEditing(null);
      await load();
    } catch (err) {
      setError(extractMessage(err, 'No se pudo actualizar la equivalencia.'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar esta equivalencia?')) return;
    try {
      await api.deleteEquivalence(id);
      await load();
    } catch (err) {
      setError(extractMessage(err, 'No se pudo eliminar.'));
    }
  }

  const input = 'px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F47735] focus:border-[#F47735] outline-none text-gray-900 text-sm';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ArrowRightLeft className="w-6 h-6 text-[#F47735]" />
          Equivalencias cliente ↔ producto
        </h1>
        <p className="text-gray-500 mt-1">
          Cómo pide cada cliente un material (&quot;BOPP 1&quot;, &quot;BOPP 345&quot;…) y a qué referencia de Oben corresponde. La lectura automática de órdenes de
          compra solo usa esta tabla: lo que no esté aquí queda como faltante, nunca se adivina.
        </p>
      </div>

      <ImportPanel
        title="Cargar la tabla de equivalencias (Excel/CSV)"
        columns={['Cliente (código, código OBEN MAS o nombre)', 'Código del cliente', 'Código Oben', 'Descripción (opcional)']}
        onImport={(dto) => api.importEquivalences(dto)}
        onDone={load}
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={`${input} w-full`}>
              <option value="">Todos los clientes</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.obenCode || c.clientId})
                </option>
              ))}
            </select>
          </div>
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar código o descripción" className={`${input} w-full pl-9`} />
          </div>
        </div>

        {clientId && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 p-3 bg-gray-50 rounded-lg">
            <input value={form.clientCode} onChange={(e) => setForm({ ...form, clientCode: e.target.value })} placeholder="Como lo pide el cliente (ej. BOPP 345)" className={input} />
            <input value={form.obenCode} onChange={(e) => setForm({ ...form, obenCode: e.target.value })} placeholder="Referencia Oben (ej. SC15TN)" className={input} />
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descripción (opcional)" className={input} />
            <button
              onClick={add}
              disabled={saving || !form.clientCode.trim() || !form.obenCode.trim()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Agregar
            </button>
          </div>
        )}
        {!clientId && <p className="text-xs text-gray-400">Escoge un cliente para agregar equivalencias una por una.</p>}

        {error && (
          <p className="text-sm text-red-700 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" /> {error}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-[#F47735]" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">No hay equivalencias{clientId ? ' para este cliente' : ''}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-600">
                  <th className="px-3 py-2 font-semibold">Cliente</th>
                  <th className="px-3 py-2 font-semibold">Como lo pide el cliente</th>
                  <th className="px-3 py-2 font-semibold">Referencia Oben</th>
                  <th className="px-3 py-2 font-semibold">Descripción</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r) =>
                  editing?.id === r.id ? (
                    <tr key={r.id} className="bg-orange-50/40">
                      <td className="px-3 py-2 text-gray-600">{r.client?.name ?? '—'}</td>
                      <td className="px-3 py-2">
                        <input value={editing.clientCode} onChange={(e) => setEditing({ ...editing, clientCode: e.target.value })} className={`${input} w-full`} />
                      </td>
                      <td className="px-3 py-2">
                        <input value={editing.obenCode} onChange={(e) => setEditing({ ...editing, obenCode: e.target.value })} className={`${input} w-full`} />
                      </td>
                      <td className="px-3 py-2">
                        <input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className={`${input} w-full`} />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <button onClick={saveEdit} className="p-1.5 text-green-700 hover:bg-green-50 rounded" title="Guardar">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditing(null)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="Cancelar">
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-600">{r.client?.name ?? '—'}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{r.clientCode}</td>
                      <td className="px-3 py-2 font-mono text-gray-900">{r.obenCode}</td>
                      <td className="px-3 py-2 text-gray-500">{r.description ?? ''}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right">
                        <button
                          onClick={() => setEditing({ id: r.id, clientCode: r.clientCode, obenCode: r.obenCode, description: r.description ?? '' })}
                          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => remove(r.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Eliminar">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            <p className="text-xs text-gray-400 mt-2">{filtered.length} equivalencia(s)</p>
          </div>
        )}
      </div>
    </div>
  );
}
