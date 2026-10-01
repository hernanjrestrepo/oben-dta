'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { EstadoFacturaParcial, FacturaParcial } from '@/types';
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, Mail, Plus, ReceiptText, RefreshCw, Send } from 'lucide-react';

function errMsg(err: unknown, fallback: string): string {
  const m = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(m) ? m.join(' · ') : m || fallback;
}

const ESTADO: Record<EstadoFacturaParcial, { label: string; cls: string }> = {
  pendiente: { label: 'Pendiente', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  facturando: { label: 'Facturando…', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  facturada: { label: 'Facturada', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rechazada: { label: 'Rechazada por Oben', cls: 'bg-red-50 text-red-700 border-red-200' },
  revisar: { label: 'Revisar en OBEN MAS', cls: 'bg-orange-50 text-[#C4521A] border-orange-200' },
};

function fecha(s: string | null): string {
  return s ? new Date(s).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

/**
 * Facturas parciales (WO-023): cuando Distribución cierra un parcial, Oben
 * manda "Proforma <PF> - Facturar Parcial" al buzón de pedidos y la solicitud
 * aparece aquí. También se puede digitar la proforma y el número de
 * distribución a mano.
 */
export default function FacturasParcialesPage() {
  const { user } = useAuthStore();
  const puedeFacturar = !!user?.permissions?.includes('invoices.create');
  const [filas, setFilas] = useState<FacturaParcial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pf, setPf] = useState('');
  const [dist, setDist] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const [facturando, setFacturando] = useState<string | null>(null);

  async function load() {
    try {
      setFilas(await api.getFacturasParciales());
    } catch (err) {
      setError(errMsg(err, 'No se pudieron cargar las facturas parciales.'));
    }
  }

  useEffect(() => {
    api
      .getFacturasParciales()
      .then(setFilas)
      .catch((err) => setError(errMsg(err, 'No se pudieron cargar las facturas parciales.')))
      .finally(() => setLoading(false));
  }, []);

  async function registrar() {
    try {
      setRegistrando(true);
      setError('');
      await api.registrarFacturaParcial(pf.trim(), dist.trim());
      setPf('');
      setDist('');
      await load();
    } catch (err) {
      setError(errMsg(err, 'No se pudo registrar.'));
    } finally {
      setRegistrando(false);
    }
  }

  async function facturar(f: FacturaParcial) {
    const confirmo = f.estado === 'revisar';
    const pregunta = confirmo
      ? `No se sabe si Oben alcanzó a facturar la PF ${f.numberPF} (distribución ${f.numeroDistribucion}). ¿Ya verificaste en OBEN MAS que NO existe esa factura? Si existe, reintentar la duplicaría.`
      : `Se creará en OBEN MAS la factura parcial de la PF ${f.numberPF}, distribución ${f.numeroDistribucion}. ¿Continuar?`;
    if (!confirm(pregunta)) return;
    try {
      setFacturando(f.id);
      setError('');
      const r = await api.facturarParcial(f.id, confirmo);
      setFilas((xs) => xs.map((x) => (x.id === r.id ? r : x)));
    } catch (err) {
      setError(errMsg(err, 'No se pudo facturar.'));
      await load();
    } finally {
      setFacturando(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ReceiptText className="w-6 h-6 text-[#F47735]" />
            Facturas parciales
          </h1>
          <p className="text-gray-500 mt-1 max-w-3xl">
            Cuando Distribución cierra un parcial, Oben envía al buzón de pedidos el correo{' '}
            <i>&quot;Proforma … - Facturar Parcial&quot;</i> con el número de distribución, y la solicitud aparece aquí. La factura se
            crea en OBEN MAS con la proforma y ese número. Cada distribución se factura una sola vez.
          </p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {puedeFacturar && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Proforma</label>
            <input value={pf} onChange={(e) => setPf(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="10770" className="w-36 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Número de distribución</label>
            <input value={dist} onChange={(e) => setDist(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="11023" className="w-44 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <button
            onClick={registrar}
            disabled={!pf || !dist || registrando}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {registrando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Registrar a mano
          </button>
          <p className="text-xs text-gray-500 basis-full">Para pruebas o si el correo no llegó. Registrar no factura: la factura se crea con el botón de cada fila.</p>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : filas.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">Todavía no ha llegado ninguna solicitud de factura parcial.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Proforma</th>
                <th className="px-4 py-2.5 font-semibold">Distribución</th>
                <th className="px-4 py-2.5 font-semibold">Origen</th>
                <th className="px-4 py-2.5 font-semibold">Recibida</th>
                <th className="px-4 py-2.5 font-semibold">Estado</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filas.map((f) => {
                const e = ESTADO[f.estado];
                const puede = puedeFacturar && ['pendiente', 'rechazada', 'revisar'].includes(f.estado);
                return (
                  <tr key={f.id} className="align-top">
                    <td className="px-4 py-3 font-semibold text-gray-900">{f.numberPF}</td>
                    <td className="px-4 py-3 text-gray-800">{f.numeroDistribucion}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {f.origen === 'correo' ? (
                        <span className="inline-flex items-center gap-1" title={f.remitente ?? ''}>
                          <Mail className="w-3.5 h-3.5 text-gray-400" /> Correo
                        </span>
                      ) : (
                        'Manual'
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fecha(f.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${e.cls}`}>
                        {f.estado === 'facturada' && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {f.estado === 'revisar' && <AlertTriangle className="w-3.5 h-3.5" />}
                        {e.label}
                      </span>
                      {f.modo === 'mock' && <span className="ml-1.5 text-[10px] font-semibold text-orange-700">SIMULADO</span>}
                      {f.estado === 'facturada' && <p className="text-[11px] text-gray-500 mt-1">{fecha(f.facturadaAt)}</p>}
                      {f.error && <p className="text-xs text-red-600 mt-1 max-w-md">{f.error}</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {puede && (
                        <button
                          onClick={() => facturar(f)}
                          disabled={facturando !== null}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg text-xs font-medium disabled:opacity-50 whitespace-nowrap"
                        >
                          {facturando === f.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          {f.estado === 'pendiente' ? 'Facturar en OBEN MAS' : 'Reintentar'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
