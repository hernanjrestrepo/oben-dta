'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import type { ComercialCaso, ComercialTablero } from '@/types';
import { AlertCircle, Briefcase, Loader2, RefreshCw, Search } from 'lucide-react';
import { CasoDetalle } from './CasoDetalle';
import { ConfigPanel, NuevaOc, SimuladorPanel } from './Paneles';
import { ParametrizacionPanel } from './ParametrizacionPanel';
import { Pipeline } from './Pipeline';
import { btnSecondary, inputCls } from './comun';

type Tab = 'pipeline' | 'nueva' | 'simulador' | 'datos' | 'config';

/**
 * Comercial / Customer Service (reunión 2026-09-23): de la orden de compra del cliente a la orden de venta activa.
 * La pestaña CRM reúne todo (indicadores, tablero o lista, lo que requiere atención); clic en una orden abre su detalle
 * con la bitácora, el freno de mano y la Proforma real en OBEN MAS. El Simulador hace lo que Oben aún no expone por API.
 */
export default function ComercialPage() {
  const [tab, setTab] = useState<Tab>('pipeline');
  const [filtros, setFiltros] = useState({ desde: '', hasta: '', cliente: '' });
  const [tablero, setTablero] = useState<ComercialTablero | null>(null);
  const [casos, setCasos] = useState<ComercialCaso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);

  const traer = useCallback(() => {
    const f = { desde: filtros.desde || undefined, hasta: filtros.hasta || undefined, cliente: filtros.cliente || undefined };
    return Promise.all([api.getComercialTablero(f), api.getComercialCasos(f)]);
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
    ['pipeline', `CRM${casos.length ? ` (${casos.length})` : ''}`],
    ['nueva', 'Nueva orden de compra'],
    ['simulador', 'Simulador'],
    ['datos', 'Datos de Oben'],
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
            De la orden de compra del cliente a la orden de venta activa: Proforma, cubicaje, aprobación, cartera. Clic en una orden para ver todo su
            detalle. Lo simulado se marca siempre.
          </p>
        </div>
        <button className={btnSecondary} onClick={() => void cargar()} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-[#F47735] text-[#F47735]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'pipeline' && (
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
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {tab === 'pipeline' &&
        (loading && casos.length === 0 ? (
          <Loader2 className="w-6 h-6 animate-spin text-[#F47735] mx-auto" />
        ) : (
          <Pipeline casos={casos} tablero={tablero} onAbrir={setAbierto} />
        ))}

      {tab === 'nueva' && (
        <NuevaOc
          onCreada={(id) => {
            void cargar();
            setAbierto(id);
          }}
        />
      )}

      {tab === 'simulador' && <SimuladorPanel casos={casos} onChange={() => void cargar()} />}
      {tab === 'datos' && <ParametrizacionPanel />}
      {tab === 'config' && <ConfigPanel />}

      {abierto && <CasoDetalle id={abierto} onClose={() => setAbierto(null)} onChange={() => void cargar()} />}
    </div>
  );
}
