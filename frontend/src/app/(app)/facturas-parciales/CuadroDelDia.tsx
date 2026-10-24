'use client';

import { useT } from '@/i18n/idioma';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { CuadroDelDia as Cuadro } from '@/types';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react';

function errMsg(err: unknown, fallback: string): string {
  const m = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(m) ? m.join(' · ') : m || fallback;
}

const hoy = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

/**
 * Cuadro de facturación del día leído DIRECTO del Excel de Oben en SharePoint (hoja MES ACTUAL, columna
 * "Dia Factura"). "Ver" solo lee. "Cargar" lo guarda como programación del día pero NO factura nada.
 */
export function CuadroDelDia({ puedeCargar }: { puedeCargar: boolean }) {
  const t = useT();
  const [fecha, setFecha] = useState(hoy());
  const [cuadro, setCuadro] = useState<Cuadro | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  async function ver() {
    setBusy('ver');
    setError('');
    setOk('');
    try {
      setCuadro(await api.getCuadroDelDia(fecha));
    } catch (err) {
      setCuadro(null);
      setError(errMsg(err, 'No se pudo leer el cuadro del Excel.'));
    } finally {
      setBusy('');
    }
  }

  async function cargar() {
    setBusy('cargar');
    setError('');
    setOk('');
    try {
      const r = await api.cargarCuadroDelDia(fecha);
      setCuadro(r);
      setOk(`Cargadas ${r.cargadas} órdenes como programación del ${r.fecha}. No se facturó nada.`);
    } catch (err) {
      setError(errMsg(err, 'No se pudo cargar el cuadro.'));
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#F47735]" />{' '}{t('Cuadro del día (Excel de Oben)')}
          </h2>
          <p className="text-sm text-gray-500">
            {t('Se lee directo de SEGUIMIENTO DIARIO OBEN COLOMBIA (hoja MES ACTUAL, filas con "Dia Factura" de esa fecha). Ya no hace falta mandar la imagen.')}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <button onClick={() => void ver()} disabled={!!busy} className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#F47735] hover:bg-[#e0652a] text-white rounded-lg text-sm font-semibold disabled:opacity-60">
            {busy === 'ver' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}{' '}{t('Ver cuadro')}
          </button>
          {puedeCargar && cuadro && cuadro.incluidas > 0 && (
            <button onClick={() => void cargar()} disabled={!!busy} className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-60">
              {busy === 'cargar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}{' '}{t('Cargar como programación (no factura)')}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
        </div>
      )}
      {ok && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2 text-sm text-green-800">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> {ok}
        </div>
      )}

      {cuadro && (
        <>
          <p className="text-sm text-gray-600">
            <b>{cuadro.fecha}</b>: {cuadro.filas.length}{' '}{t('filas en el Excel ·')}{' '}<b className="text-green-700">{cuadro.incluidas}{' '}{t('para facturar')}</b> · {cuadro.excluidas}{' '}{t('excluidas.')}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="py-2 pr-3">{t('Status OV')}</th>
                  <th className="pr-3">OV</th>
                  <th className="pr-3">{t('Cliente')}</th>
                  <th className="pr-3">{t('Proforma')}</th>
                  <th className="pr-3 text-right">{t('KG')}</th>
                  <th className="pr-3">{t('Tipo')}</th>
                  <th>{t('Se factura')}</th>
                </tr>
              </thead>
              <tbody>
                {cuadro.filas.map((f) => (
                  <tr key={f.ov} className={`border-b border-gray-100 ${f.incluida ? '' : 'text-gray-400'}`}>
                    <td className="py-1.5 pr-3">{f.statusOv}</td>
                    <td className="pr-3 tabular-nums">{f.ov}</td>
                    <td className="pr-3">{f.cliente}</td>
                    <td className="pr-3 tabular-nums">{f.pf}</td>
                    <td className="pr-3 text-right tabular-nums">{f.kg?.toLocaleString('es-CO') ?? '—'}</td>
                    <td className="pr-3">{f.tipo}</td>
                    <td>{f.incluida ? <span className="text-green-700 font-medium">{t('Sí')}</span> : <span title={f.motivo ?? ''}>{t('No —')}{' '}{f.motivo}</span>}</td>
                  </tr>
                ))}
                {cuadro.filas.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-gray-400">
                      {t('El Excel no trae órdenes con "Dia Factura" =')}{' '}{cuadro.fecha}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
