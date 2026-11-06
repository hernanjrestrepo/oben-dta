'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, BadgeCheck, Layers, Loader2, Star, X } from 'lucide-react';
import { useT } from '@/i18n/idioma';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import type { LiquidacionConsolidada } from '@/types';
import { Card, btnSecondary, inputCls, kg, usd } from './ui';

/**
 * Liquidación consolidada (Hernán, 6-nov): varias proformas del mismo envío se liquidan juntas. La ruta es la de la PF
 * principal (la primera) con los contenedores de todo el envío; el flete y los gastos se reparten por peso. COMEX
 * aprueba una vez y cada PF queda aprobada con su parte (en Oben se liquida cada una por separado).
 */
export function ConsolidadaPanel({
  pfs,
  onCambiar,
  onAprobado,
}: {
  pfs: string[];
  onCambiar: (pfs: string[]) => void;
  onAprobado?: () => void;
}) {
  const t = useT();
  const [otros, setOtros] = useState('');
  const [datos, setDatos] = useState<LiquidacionConsolidada | null>(null);
  const [cargando, setCargando] = useState(false);
  const [aprobando, setAprobando] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const req = useRef(0);
  const otrosNum = otros.trim() ? Number(otros.replace(',', '.')) : null;
  const otrosValidos = otrosNum === null || (Number.isFinite(otrosNum) && otrosNum >= 0);

  useEffect(() => {
    if (pfs.length < 2 || !otrosValidos) return;
    const id = ++req.current;
    const h = setTimeout(() => {
      setCargando(true);
      setError('');
      api
        .getLiquidacionConsolidada(pfs, otrosNum)
        .then((d) => id === req.current && setDatos(d))
        .catch((err) => id === req.current && setError(extractMessage(err, 'No se pudo calcular la liquidación consolidada.')))
        .finally(() => id === req.current && setCargando(false));
    }, 400);
    return () => clearTimeout(h);
  }, [pfs, otrosNum, otrosValidos]);

  async function aprobar() {
    if (!confirm(`¿Aprobar la liquidación consolidada de ${pfs.length} proformas (PF ${pfs.join(', ')})? Cada PF queda aprobada con su parte del flete y los gastos.`)) return;
    try {
      setAprobando(true);
      setError('');
      const d = await api.approveLiquidacionConsolidada(pfs, otrosNum);
      setDatos(d);
      setOk(`Liquidación consolidada aprobada: ${d.partes.length} proformas. Cada una sigue su curso (correo de revisión y factura).`);
      onAprobado?.();
    } catch (err) {
      setError(extractMessage(err, 'No se pudo aprobar la liquidación consolidada.'));
    } finally {
      setAprobando(false);
    }
  }

  const principal = pfs[0];
  const quitar = (pf: string) => onCambiar(pfs.filter((x) => x !== pf));
  const hacerPrincipal = (pf: string) => onCambiar([pf, ...pfs.filter((x) => x !== pf)]);
  const pct = (n: number) => `${(n * 100).toLocaleString('es-CO', { maximumFractionDigits: 2 })} %`;

  return (
    <Card>
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Layers className="w-4 h-4 text-[#E5641F]" />
          <h3 className="text-sm font-semibold text-gray-900">{t('Liquidación consolidada')}</h3>
          <span className="text-xs text-gray-500">
            {t('Ruta de la PF principal')} ({principal}) · {t('flete y gastos repartidos por peso')}
          </span>
          {cargando && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
        </div>

        {datos && (
          <p className="text-xs text-gray-700">
            {t('Envío:')} <b>{kg(datos.kilosTotales)} kg</b> · {datos.contenedores} {datos.contenedores === 1 ? t('contenedor') : t('contenedores')} · {t('flete del envío')}{' '}
            <b>{datos.totales.flete !== null ? usd(datos.totales.flete) : '—'}</b>
            {datos.totales.inlandFreight !== null && (
              <>
                {' '}· Inland <b>{usd(datos.totales.inlandFreight)}</b>
              </>
            )}
            {datos.totales.otrosGastos !== null && (
              <>
                {' '}· {t('otros gastos')} <b>{usd(datos.totales.otrosGastos)}</b>
              </>
            )}
          </p>
        )}

        {datos?.avisos.map((a) => (
          <p key={a} className="text-xs text-amber-800 flex gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
            {a}
          </p>
        ))}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-600">
                <th className="px-2 py-1.5">PF</th>
                <th className="px-2 py-1.5">{t('Cliente')}</th>
                <th className="px-2 py-1.5 text-right">Kg</th>
                <th className="px-2 py-1.5 text-right">{t('% del peso')}</th>
                <th className="px-2 py-1.5 text-right">{t('Flete')}</th>
                <th className="px-2 py-1.5 text-right">{t('Otros gastos')}</th>
                <th className="px-2 py-1.5 text-right">FOB</th>
                <th className="px-2 py-1.5">{t('Estado')}</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pfs.map((pf) => {
                const p = datos?.partes.find((x) => x.numberPF === pf);
                const otrosPf = p ? [p.otrosGastos, p.inlandFreight, p.entryFee, p.importerSecurityFiling].reduce<number>((a, v) => a + (v ?? 0), 0) : null;
                return (
                  <tr key={pf}>
                    <td className="px-2 py-1.5 font-semibold whitespace-nowrap">
                      {pf} {pf === principal && <Star className="inline w-3 h-3 text-amber-500" aria-label={t('principal')} />}
                    </td>
                    <td className="px-2 py-1.5 text-gray-700 max-w-[200px] truncate">{p?.cliente ?? '…'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p ? kg(p.kilos) : '…'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p ? pct(p.participacion) : '…'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p?.flete !== null && p?.flete !== undefined ? usd(p.flete) : '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{otrosPf ? usd(otrosPf) : '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p ? usd(p.fob) : '…'}</td>
                    <td className="px-2 py-1.5">
                      {!p ? (
                        '…'
                      ) : p.aprobadaVigente ? (
                        <span className="text-emerald-700">{t('Aprobada')}</span>
                      ) : p.readyToSubmit ? (
                        <span className="text-emerald-700">{t('Lista')}</span>
                      ) : (
                        <span className="text-red-700" title={p.missing.join('\n')}>
                          {t('Faltan')} {p.missing.length}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-right">
                      {pf !== principal && (
                        <button type="button" className="text-[11px] text-[#E5641F] hover:underline mr-2" onClick={() => hacerPrincipal(pf)} title={t('Usar la ruta de esta PF para todo el envío')}>
                          {t('Principal')}
                        </button>
                      )}
                      <button type="button" className="text-gray-400 hover:text-red-600" onClick={() => quitar(pf)} aria-label={`${t('Quitar')} PF ${pf}`}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[11px] font-medium text-gray-700">
            {t('Otros gastos de todo el envío (USD, opcional)')}
            <input value={otros} onChange={(e) => setOtros(e.target.value)} className={`${inputCls} w-40 mt-0.5 block`} placeholder="0" />
          </label>
          {!otrosValidos && <span className="text-xs text-red-700">{t('Escribe un número mayor o igual a 0.')}</span>}
        </div>

        {datos?.partes.some((p) => !p.readyToSubmit) && (
          <div className="text-xs text-red-700 space-y-0.5">
            {datos.partes
              .filter((p) => !p.readyToSubmit)
              .map((p) => (
                <p key={p.numberPF}>
                  <b>PF {p.numberPF}:</b> {p.missing.slice(0, 3).join(' · ')}
                  {p.missing.length > 3 ? ` (+${p.missing.length - 3})` : ''}
                </p>
              ))}
          </div>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
        {ok && <p className="text-sm text-emerald-700">{ok}</p>}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold shadow-sm hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none disabled:cursor-not-allowed"
            onClick={() => void aprobar()}
            disabled={aprobando || cargando || !datos?.listo || !otrosValidos}
            title={datos && !datos.listo ? t('Hay proformas con datos faltantes') : undefined}
          >
            {aprobando ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />} {t('Aprobar liquidación consolidada (COMEX)')}
          </button>
          <button className={btnSecondary} onClick={() => onCambiar([])} disabled={aprobando}>
            {t('Cancelar consolidación')}
          </button>
        </div>
      </div>
    </Card>
  );
}
