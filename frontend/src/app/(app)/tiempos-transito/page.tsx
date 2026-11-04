'use client';

import { useT } from '@/i18n/idioma';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import type { DespachoCalculado, FestivoColombia, TransitTime } from '@/types';
import { ImportPanel } from '@/components/ImportPanel';
import { AlertCircle, CalendarDays, Check, Clock, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';

const vacio = { pais: '', puerto: '', incoterm: '', oceanDays: '0', inlandDays: '0' };

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const diaDe = (f: string) => DIAS[new Date(`${f}T00:00:00Z`).getUTCDay()];

/**
 * Tiempos de tránsito por país / puerto destino / incoterm (lista de Alejandra Molinares, 4-nov-2026). Se usan para el
 * lead time y para calcular la fecha de despacho (ShipmentDate) de la proforma: fecha de entrega menos los días HÁBILES de
 * tránsito (solo se despacha de lunes a viernes, sin festivos de Colombia).
 */
export default function TiemposTransitoPage() {
  const t = useT();
  const [rows, setRows] = useState<TransitTime[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(vacio);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ id: string; pais: string; puerto: string; incoterm: string; oceanDays: string; inlandDays: string } | null>(null);

  const [anio, setAnio] = useState(new Date().getFullYear());
  const [festivos, setFestivos] = useState<FestivoColombia[]>([]);
  const [sim, setSim] = useState({ entrega: '', puerto: '', incoterm: 'DDP', pais: '' });
  const [simRes, setSimRes] = useState<DespachoCalculado | null>(null);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    api.getFestivos(anio).then(setFestivos).catch((err) => setError(extractMessage(err, 'No se pudieron cargar los festivos.')));
  }, [anio]);

  async function load() {
    try {
      setLoading(true);
      setError('');
      setRows(await api.getTransitTimes());
    } catch (err) {
      setError(extractMessage(err, 'No se pudieron cargar los tiempos de tránsito.'));
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.pais, r.puerto, r.incoterm].some((v) => v.toLowerCase().includes(q)));
  }, [rows, search]);

  async function add() {
    try {
      setSaving(true);
      setError('');
      await api.createTransitTime({ pais: form.pais.trim(), puerto: form.puerto.trim(), incoterm: form.incoterm.trim(), oceanDays: Number(form.oceanDays), inlandDays: Number(form.inlandDays) });
      setForm(vacio);
      await load();
    } catch (err) {
      setError(extractMessage(err, 'No se pudo guardar el tiempo de tránsito.'));
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      setSaving(true);
      setError('');
      await api.updateTransitTime(editing.id, {
        pais: editing.pais.trim(),
        puerto: editing.puerto.trim(),
        incoterm: editing.incoterm.trim(),
        oceanDays: Number(editing.oceanDays),
        inlandDays: Number(editing.inlandDays),
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(extractMessage(err, 'No se pudo actualizar.'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar este tiempo de tránsito?')) return;
    try {
      await api.deleteTransitTime(id);
      await load();
    } catch (err) {
      setError(extractMessage(err, 'No se pudo eliminar.'));
    }
  }

  async function simular() {
    try {
      setError('');
      setSimRes(await api.calcularDespacho({ entrega: sim.entrega, puerto: sim.puerto, incoterm: sim.incoterm, ...(sim.pais ? { pais: sim.pais } : {}) }));
    } catch (err) {
      setSimRes(null);
      setError(extractMessage(err, 'No se pudo calcular el despacho.'));
    }
  }

  const input = 'px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F47735] focus:border-[#F47735] outline-none text-gray-900 text-sm';
  const num = `${input} w-20`;
  const formOk = form.pais.trim() && form.puerto.trim() && form.incoterm.trim() && form.oceanDays !== '' && form.inlandDays !== '';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Clock className="w-6 h-6 text-[#F47735]" />
          {t('Tiempos de tránsito')}
        </h1>
        <p className="text-gray-500 mt-1">
          {t('Días de tránsito por país, puerto de destino e incoterm. Con ellos se calcula el lead time y la fecha de despacho de la proforma: la fecha de entrega menos los días hábiles de tránsito. Solo se despacha de lunes a viernes: no cuentan sábados, domingos ni festivos de Colombia.')}
        </p>
      </div>

      <ImportPanel
        title={t('Cargar la lista de tránsitos (Excel/CSV)')}
        columns={['PAIS', 'PUERTO DESTINO', 'INCONTERM', 'OCEAN (DIAS)', 'INLAND (DIAS)', 'TOTAL (DIAS)']}
        onImport={(dto) => api.importTransitTimes(dto)}
        onDone={load}
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">{t('Calcular la fecha de despacho')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
          <label className="text-xs text-gray-600">
            {t('Fecha de entrega')}
            <input type="date" value={sim.entrega} onChange={(e) => setSim({ ...sim, entrega: e.target.value })} className={`${input} w-full mt-1`} />
          </label>
          <label className="text-xs text-gray-600">
            {t('Puerto destino')}
            <input value={sim.puerto} onChange={(e) => setSim({ ...sim, puerto: e.target.value })} placeholder="BOGOTÁ, D.C." className={`${input} w-full mt-1`} />
          </label>
          <label className="text-xs text-gray-600">
            {t('Incoterm')}
            <input value={sim.incoterm} onChange={(e) => setSim({ ...sim, incoterm: e.target.value })} placeholder="DDP" className={`${input} w-full mt-1`} />
          </label>
          <label className="text-xs text-gray-600">
            {t('País (si el puerto se repite)')}
            <input value={sim.pais} onChange={(e) => setSim({ ...sim, pais: e.target.value })} placeholder="COLOMBIA" className={`${input} w-full mt-1`} />
          </label>
          <button onClick={simular} disabled={!sim.entrega || !sim.puerto || !sim.incoterm} className="px-4 py-2 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {t('Calcular')}
          </button>
        </div>
        {simRes && (
          <p className={`text-sm ${simRes.fecha ? 'text-green-800' : 'text-amber-800'}`}>
            {simRes.fecha ? `${diaDe(simRes.fecha)} ${simRes.fecha} — ` : ''}
            {simRes.mensaje}
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Buscar país, puerto o incoterm')} className={`${input} w-full pl-9`} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 p-3 bg-gray-50 rounded-lg">
          <input value={form.pais} onChange={(e) => setForm({ ...form, pais: e.target.value })} placeholder={t('País')} className={input} />
          <input value={form.puerto} onChange={(e) => setForm({ ...form, puerto: e.target.value })} placeholder={t('Puerto destino')} className={input} />
          <input value={form.incoterm} onChange={(e) => setForm({ ...form, incoterm: e.target.value })} placeholder={t('Incoterm')} className={input} />
          <div className="flex gap-2">
            <input type="number" min={0} value={form.oceanDays} onChange={(e) => setForm({ ...form, oceanDays: e.target.value })} title="Ocean (días)" className={num} />
            <input type="number" min={0} value={form.inlandDays} onChange={(e) => setForm({ ...form, inlandDays: e.target.value })} title="Inland (días)" className={num} />
          </div>
          <span className="text-sm text-gray-500 self-center">
            {t('Total')}: {Number(form.oceanDays || 0) + Number(form.inlandDays || 0)} {t('días')}
          </span>
          <button onClick={add} disabled={saving || !formOk} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {t('Agregar')}
          </button>
        </div>

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
          <p className="text-sm text-gray-500 py-6 text-center">{t('No hay tiempos de tránsito')}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-600">
                  <th className="px-3 py-2 font-semibold">{t('País')}</th>
                  <th className="px-3 py-2 font-semibold">{t('Puerto destino')}</th>
                  <th className="px-3 py-2 font-semibold">{t('Incoterm')}</th>
                  <th className="px-3 py-2 font-semibold text-right">Ocean</th>
                  <th className="px-3 py-2 font-semibold text-right">Inland</th>
                  <th className="px-3 py-2 font-semibold text-right">{t('Total (días)')}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r) =>
                  editing?.id === r.id ? (
                    <tr key={r.id} className="bg-orange-50/40">
                      <td className="px-3 py-2"><input value={editing.pais} onChange={(e) => setEditing({ ...editing, pais: e.target.value })} className={`${input} w-full`} /></td>
                      <td className="px-3 py-2"><input value={editing.puerto} onChange={(e) => setEditing({ ...editing, puerto: e.target.value })} className={`${input} w-full`} /></td>
                      <td className="px-3 py-2"><input value={editing.incoterm} onChange={(e) => setEditing({ ...editing, incoterm: e.target.value })} className={`${input} w-24`} /></td>
                      <td className="px-3 py-2 text-right"><input type="number" min={0} value={editing.oceanDays} onChange={(e) => setEditing({ ...editing, oceanDays: e.target.value })} className={num} /></td>
                      <td className="px-3 py-2 text-right"><input type="number" min={0} value={editing.inlandDays} onChange={(e) => setEditing({ ...editing, inlandDays: e.target.value })} className={num} /></td>
                      <td className="px-3 py-2 text-right font-semibold">{Number(editing.oceanDays || 0) + Number(editing.inlandDays || 0)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <button onClick={saveEdit} className="p-1.5 text-green-700 hover:bg-green-50 rounded" title={t('Guardar')}><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditing(null)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title={t('Cancelar')}><X className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-700">{r.pais}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{r.puerto}</td>
                      <td className="px-3 py-2 font-mono text-gray-700">{r.incoterm}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{r.oceanDays}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{r.inlandDays}</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-900">{r.totalDays}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right">
                        <button
                          onClick={() => setEditing({ id: r.id, pais: r.pais, puerto: r.puerto, incoterm: r.incoterm, oceanDays: String(r.oceanDays), inlandDays: String(r.inlandDays) })}
                          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                          title={t('Editar')}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => remove(r.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title={t('Eliminar')}><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            <p className="text-xs text-gray-400 mt-2">{filtered.length} {t('tiempo(s) de tránsito')}</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-[#F47735]" /> {t('Festivos de Colombia')}
          </h2>
          <button onClick={() => setAnio(anio - 1)} className="px-2 py-1 border rounded text-sm">‹</button>
          <span className="font-medium text-gray-800">{anio}</span>
          <button onClick={() => setAnio(anio + 1)} className="px-2 py-1 border rounded text-sm">›</button>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-sm">
          {festivos.map((f) => (
            <li key={f.fecha} className="flex justify-between border-b border-gray-100 py-1">
              <span className="text-gray-700">{f.nombre}</span>
              <span className="text-gray-500">{diaDe(f.fecha)} {f.fecha.slice(5)}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-400">{t('Ley Emiliani: los festivos que no caen lunes pasan al lunes siguiente. Se calculan solos cada año.')}</p>
      </div>
    </div>
  );
}
