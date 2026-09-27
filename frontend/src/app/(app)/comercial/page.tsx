'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import type { ComercialCaso, ComercialTablero } from '@/types';
import { AlertCircle, AlertTriangle, Briefcase, Loader2, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { CasoDetalle } from './CasoDetalle';
import { ConfigPanel, NuevaOc, SimuladorPanel } from './Paneles';
import { ESTADOS, ESTADO_LABEL, EstadoBadge, SimuladoBadge, btnSecondary, fecha, inputCls } from './comun';

type Tab = 'tablero' | 'casos' | 'nueva' | 'config';

const TIEMPOS: Array<[string, string]> = [
  ['ocAProforma', 'OC → Proforma'],
  ['proformaACubicada', 'Proforma → cubicada'],
  ['envioAAprobacion', 'Envío → aprobación del cliente'],
  ['retenidaALiberada', 'Retenida → cartera libera'],
  ['ocAActiva', 'OC → OV activa'],
];

/**
 * Comercial / Customer Service (reunión 2026-09-23): de la orden de compra
 * del cliente a la orden de venta activa — tablero por etapa (filtrable por
 * fechas y cliente), casos con su bitácora, freno de mano y configuración.
 */
export default function ComercialPage() {
  const [tab, setTab] = useState<Tab>('tablero');
  const [filtros, setFiltros] = useState({ desde: '', hasta: '', cliente: '', estado: '' });
  const [tablero, setTablero] = useState<ComercialTablero | null>(null);
  const [casos, setCasos] = useState<ComercialCaso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);

  const traer = useCallback(() => {
    const f = { desde: filtros.desde || undefined, hasta: filtros.hasta || undefined, cliente: filtros.cliente || undefined };
    return Promise.all([api.getComercialTablero(f), api.getComercialCasos({ ...f, estado: filtros.estado || undefined })]);
  }, [filtros]);

  const aplicar = useCallback((r: Promise<[ComercialTablero, ComercialCaso[]]>) => {
    r.then(([t, c]) => {
      setTablero(t);
      setCasos(c);
      setError('');
    })
      .catch((err) => setError(extractMessage(err, 'No se pudo cargar Comercial.')))
      .finally(() => setLoading(false));
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    aplicar(traer());
  }, [aplicar, traer]);

  useEffect(() => {
    aplicar(traer());
  }, [aplicar, traer]);

  const tabs: Array<[Tab, string]> = [
    ['tablero', 'Tablero'],
    ['casos', `Casos${casos.length ? ` (${casos.length})` : ''}`],
    ['nueva', 'Nueva orden de compra'],
    ['config', 'Configuración'],
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-[#F47735]" />
            Comercial
          </h1>
          <p className="text-gray-500 mt-1">
            De la orden de compra del cliente a la orden de venta activa: Proforma, cubicaje, aprobación, cartera. Lo simulado se marca siempre.
          </p>
        </div>
        <button className={btnSecondary} onClick={() => void cargar()} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-[#F47735] text-[#F47735]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {(tab === 'tablero' || tab === 'casos') && (
        <div className="flex flex-col md:flex-row gap-2 md:items-end">
          <div>
            <label className="block text-xs text-gray-500">Desde</label>
            <input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Hasta</label>
            <input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} className={inputCls} />
          </div>
          <div className="relative flex-1">
            <label className="block text-xs text-gray-500">Cliente</label>
            <Search className="w-4 h-4 text-gray-400 absolute left-3 bottom-2.5" />
            <input value={filtros.cliente} onChange={(e) => setFiltros({ ...filtros, cliente: e.target.value })} placeholder="Nombre del cliente" className={`${inputCls} w-full pl-9`} />
          </div>
          {tab === 'casos' && (
            <div>
              <label className="block text-xs text-gray-500">Etapa</label>
              <select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })} className={inputCls}>
                <option value="">Todas</option>
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>
                    {ESTADO_LABEL[e]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {tab === 'tablero' &&
        (loading && !tablero ? (
          <Loader2 className="w-6 h-6 animate-spin text-[#F47735] mx-auto" />
        ) : tablero ? (
          <div className="space-y-6">
            {tablero.simulated && (
              <div className="flex items-center gap-2 text-sm text-purple-900">
                <SimuladoBadge /> Hay casos con datos simulados en este rango.
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {ESTADOS.map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    setFiltros({ ...filtros, estado: e });
                    setTab('casos');
                  }}
                  className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-[#F47735] transition"
                >
                  <p className="text-2xl font-bold text-gray-900 tabular-nums">{tablero.embudo[e] ?? 0}</p>
                  <p className="text-xs text-gray-500">{ESTADO_LABEL[e]}</p>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
                  <ShieldAlert className="w-5 h-5 text-amber-600" /> Requieren atención ({tablero.requierenAtencion.length})
                </h2>
                {tablero.requierenAtencion.length === 0 ? (
                  <p className="text-sm text-gray-500">Nada pendiente.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {tablero.requierenAtencion.map((a) => (
                      <li key={a.id}>
                        <button onClick={() => setAbierto(a.id)} className="w-full text-left py-2 hover:bg-gray-50 px-2 rounded">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-gray-900">{a.cliente ?? '(sin identificar)'}</span>
                            <EstadoBadge estado={a.estado} />
                            <span className="text-gray-400 text-xs">
                              OC {a.ocNumero ?? '—'} · PF {a.numberPF ?? '—'}
                            </span>
                          </div>
                          {a.accionPendiente && <p className="text-xs text-amber-800 mt-0.5">Confirmar: {a.accionPendiente}</p>}
                          {a.motivos.slice(0, 2).map((m) => (
                            <p key={m} className="text-xs text-red-700 mt-0.5 flex items-start gap-1">
                              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {m}
                            </p>
                          ))}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="font-semibold text-gray-900 mb-2">Tiempos promedio (horas)</h2>
                  <ul className="text-sm space-y-1">
                    {TIEMPOS.map(([k, label]) => (
                      <li key={k} className="flex justify-between">
                        <span className="text-gray-600">{label}</span>
                        <span className="font-medium tabular-nums">{tablero.tiemposPromedioHoras[k] ?? '—'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="font-semibold text-gray-900 mb-2">Por cliente</h2>
                  <ul className="text-sm space-y-1">
                    {tablero.porCliente.slice(0, 10).map((c) => (
                      <li key={c.cliente} className="flex justify-between gap-2">
                        <span className="text-gray-700 truncate">{c.cliente}</span>
                        <span className="tabular-nums text-gray-500">
                          {c.abiertas}/{c.total}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-gray-400 mt-1">abiertas / total</p>
                </div>
              </div>
            </div>
            <SimuladorPanel onChange={() => void cargar()} />
          </div>
        ) : null)}

      {tab === 'casos' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {casos.length === 0 ? (
            <p className="text-sm text-gray-500 p-6 text-center">{loading ? 'Cargando…' : 'No hay casos con estos filtros.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-600">
                    <th className="px-3 py-2 font-semibold">Recibida</th>
                    <th className="px-3 py-2 font-semibold">Cliente</th>
                    <th className="px-3 py-2 font-semibold">OC</th>
                    <th className="px-3 py-2 font-semibold">Proforma / OV</th>
                    <th className="px-3 py-2 font-semibold">Etapa</th>
                    <th className="px-3 py-2 font-semibold">Pendiente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {casos.map((c) => (
                    <tr key={c.id} onClick={() => setAbierto(c.id)} className="hover:bg-gray-50 cursor-pointer">
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fecha(c.ocRecibidaEn)}</td>
                      <td className="px-3 py-2 text-gray-900">
                        {c.cliente ?? c.contactoEmail} {c.simulated && <SimuladoBadge items={c.simulatedItems} />}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{c.ocNumero ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-700">
                        {c.numberPF ?? '—'}
                        {c.numberOrderSales ? ` / ${c.numberOrderSales}` : ''}
                      </td>
                      <td className="px-3 py-2">
                        <EstadoBadge estado={c.estado} />
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {c.accionPendiente && <span className="text-amber-800">Confirmar</span>}
                        {c.missing.length > 0 && <span className="text-red-700 ml-1">{c.missing.length} faltante(s)</span>}
                        {c.atencion.length > 0 && <span className="text-red-700 ml-1">revisar</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'nueva' && (
        <NuevaOc
          onCreada={(id) => {
            void cargar();
            setAbierto(id);
          }}
        />
      )}

      {tab === 'config' && <ConfigPanel />}

      {abierto && <CasoDetalle id={abierto} onClose={() => setAbierto(null)} onChange={() => void cargar()} />}
    </div>
  );
}
