'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { FreightInlandRate, FreightTransloadRate, FreightDestinationSurcharge } from '@/types';
import { Truck, Loader2, AlertCircle, MapPin, Clock, Ship, Percent } from 'lucide-react';

type Tab = 'inland' | 'transload' | 'surcharges';

export default function FletesPage() {
  const [tab, setTab] = useState<Tab>('inland');
  const [inland, setInland] = useState<FreightInlandRate[]>([]);
  const [transload, setTransload] = useState<FreightTransloadRate[]>([]);
  const [surcharges, setSurcharges] = useState<FreightDestinationSurcharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      setError('');
      const [i, t, s] = await Promise.all([
        api.getFreightInland(),
        api.getFreightTransload(),
        api.getFreightSurcharges(),
      ]);
      setInland(i);
      setTransload(t);
      setSurcharges(s);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Error cargando el maestro de tarifas');
    } finally {
      setLoading(false);
    }
  }

  const tabs: { key: Tab; label: string; icon: React.ElementType; count: number }[] = [
    { key: 'inland', label: 'Inland / Canada', icon: Truck, count: inland.length },
    { key: 'transload', label: 'Transload', icon: Ship, count: transload.length },
    { key: 'surcharges', label: 'Recargos de destino', icon: Percent, count: surcharges.length },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-[#F47735] animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Truck className="w-6 h-6 text-[#F47735]" />
          Tarifas de Flete
        </h1>
        <p className="text-gray-500 mt-1">
          Maestro real cargado desde el forwarder de Oben — precisión de origen, sin estimaciones.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                active
                  ? 'border-[#F47735] text-[#F47735]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${active ? 'bg-orange-100 text-[#F47735]' : 'bg-gray-100 text-gray-500'}`}>
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Inland */}
      {tab === 'inland' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">País</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Forwarder</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Puerto destino</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Estado / Dirección</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Peso (lbs)</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Tarifa 40HC</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Tránsito</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {inland.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                      Sin tarifas cargadas
                    </td>
                  </tr>
                ) : (
                  inland.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700">
                          {r.country}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{r.forwarder}</td>
                      <td className="px-4 py-3 text-gray-700">{r.destinationPort}</td>
                      <td className="px-4 py-3 text-gray-600">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{r.state} — {r.destinationAddress}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">{r.weightLbs?.toLocaleString('es-CO') ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[#F47735]">
                        ${Number(r.rate40hc).toLocaleString('es-CO')}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {r.transitTimeDays != null ? (
                          <div className="flex items-center justify-end gap-1">
                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                            {r.transitTimeDays}d
                          </div>
                        ) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transload */}
      {tab === 'transload' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Puerto destino</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Dirección de entrega</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Peso unit. (lbs)</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Tarifa transload</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Tarifa transporte</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transload.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                      Sin tarifas cargadas
                    </td>
                  </tr>
                ) : (
                  transload.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700">{r.destinationPort ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{r.deliveryAddress}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{r.unitWeightLbs?.toLocaleString('es-CO') ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[#F47735]">
                        ${Number(r.transloadingRate).toLocaleString('es-CO')}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[#F47735]">
                        ${Number(r.transportationRate).toLocaleString('es-CO')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Surcharges */}
      {tab === 'surcharges' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">País</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Recargo</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Valor</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Fórmula</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {surcharges.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-gray-400">
                      Sin recargos cargados
                    </td>
                  </tr>
                ) : (
                  surcharges.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700">
                          {r.country}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{r.surchargeName}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[#F47735]">
                        {r.rateAmount != null ? `$${Number(r.rateAmount).toLocaleString('es-CO')}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-mono">{r.rateFormula ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
