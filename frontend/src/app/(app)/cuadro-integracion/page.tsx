'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import type { CuadroIntegracion, CuadroLineaInsumo } from '@/types';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Search, TriangleAlert } from 'lucide-react';

const num = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n: number) => `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;

const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-600 bg-gray-100 border-b border-gray-200';
const td = 'px-3 py-1.5 text-xs text-gray-800 border-b border-gray-100';
const tdr = `${td} text-right tabular-nums`;

function TablaInsumos({ titulo, lineas, total }: { titulo: string; lineas: CuadroLineaInsumo[]; total: number }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <h3 className="px-4 py-2.5 text-sm font-semibold text-gray-900 bg-orange-50 border-b border-orange-100">{titulo}</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className={th}>Referencia</th>
              <th className={th}>Declaración</th>
              <th className={th}>Subpartida</th>
              <th className={th}>Descripción</th>
              <th className={th}>Un.</th>
              <th className={`${th} text-right`}>Cantidad</th>
              <th className={`${th} text-right`}>Peso neto kg</th>
              <th className={`${th} text-right`}>Valor US$</th>
              <th className={`${th} text-right`}>% Desp.</th>
            </tr>
          </thead>
          <tbody>
            {lineas.length === 0 && (
              <tr>
                <td className={`${td} text-center text-gray-500`} colSpan={9}>
                  Sin insumos de este origen en la orden.
                </td>
              </tr>
            )}
            {lineas.map((l) => (
              <tr key={l.referencia}>
                <td className={`${td} font-medium`}>{l.referencia}</td>
                <td className={td}>{l.declaracion ?? '—'}</td>
                <td className={td}>{l.subpartida ?? '—'}</td>
                <td className={td}>{l.descripcion}</td>
                <td className={td}>{l.unidad}</td>
                <td className={tdr}>{num(l.cantidad, 4)}</td>
                <td className={tdr}>{num(l.pesoNetoKg)}</td>
                <td className={tdr}>{num(l.valorUsd)}</td>
                <td className={tdr}>{num(l.pctDesperdicio)}</td>
              </tr>
            ))}
            <tr className="bg-gray-50">
              <td className={`${td} font-semibold`} colSpan={7}>
                Total
              </td>
              <td className={`${tdr} font-semibold`}>{num(total)}</td>
              <td className={td} />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function CuadroIntegracionPage() {
  const [orden, setOrden] = useState('');
  const [cuadro, setCuadro] = useState<CuadroIntegracion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState('');

  async function cargar() {
    const o = orden.trim();
    if (!o || cargando) return;
    setCargando(true);
    setError('');
    try {
      setCuadro(await api.getCuadroIntegracion(o));
    } catch (err) {
      setCuadro(null);
      setError(extractMessage(err, 'No se pudo armar el cuadro de integración.'));
    } finally {
      setCargando(false);
    }
  }

  async function descargar() {
    if (!cuadro) return;
    setBajando(true);
    try {
      const blob = await api.downloadCuadroIntegracionExcel(cuadro.orden);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cuadro-integracion-${cuadro.orden}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(extractMessage(err, 'No se pudo descargar el Excel.'));
    } finally {
      setBajando(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-[#F47735]" /> Cuadro de integración
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Certificado de Integración de Materias Primas e Insumos Nacionales y Extranjeros — Zona Franca Permanente Internacional del Atlántico.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 flex gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={orden}
            onChange={(e) => setOrden(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void cargar()}
            placeholder="Número de orden (p. ej. 11028)"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-[#F47735] focus:border-[#F47735] outline-none"
          />
        </div>
        <button
          onClick={() => void cargar()}
          disabled={!orden.trim() || cargando}
          className="px-5 py-2.5 rounded-lg bg-[#F47735] hover:bg-[#E5641F] text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
        >
          {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Armar cuadro
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </p>
      )}

      {cuadro && (
        <>
          {cuadro.simulado && (
            <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 text-sm text-purple-900 flex gap-2">
              <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>DATOS SIMULADOS.</strong> El consumo por orden y los maestros todavía no vienen del ERP de Oben: este cuadro usa el ejemplo del certificado 51590 y no tiene validez para la Zona Franca.
              </span>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-gray-700">
              <p>
                <span className="text-gray-500">Orden:</span> <strong>{cuadro.orden}</strong>
              </p>
              <p>
                <span className="text-gray-500">Destino:</span> <strong>{cuadro.destino}</strong>
              </p>
            </div>
            <div
              className={`text-xs font-medium flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${
                cuadro.balanceMasa.cuadra ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              {cuadro.balanceMasa.cuadra ? <CheckCircle2 className="w-3.5 h-3.5" /> : <TriangleAlert className="w-3.5 h-3.5" />}
              Masas: consumo MP {num(cuadro.balanceMasa.consumoMpKg)} kg · producto {num(cuadro.balanceMasa.productoKg)} kg · diferencia {num(cuadro.balanceMasa.diferenciaKg)} kg
            </div>
            <button
              onClick={() => void descargar()}
              disabled={bajando}
              className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium text-gray-800 flex items-center gap-2 disabled:opacity-60"
            >
              {bajando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Descargar Excel
            </button>
          </div>

          {cuadro.avisos.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold mb-1">Avisos del cuadro</p>
              <ul className="list-disc pl-5 space-y-0.5">
                {cuadro.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <h3 className="px-4 py-2.5 text-sm font-semibold text-gray-900 bg-orange-50 border-b border-orange-100">Producto(s) elaborado(s)</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={th}>Referencia</th>
                    <th className={th}>Descripción</th>
                    <th className={th}>Subpartida</th>
                    <th className={`${th} text-right`}>Cantidad kg</th>
                    <th className={`${th} text-right`}>Valor US$</th>
                  </tr>
                </thead>
                <tbody>
                  {cuadro.productos.map((p) => (
                    <tr key={p.referencia}>
                      <td className={`${td} font-medium`}>{p.referencia}</td>
                      <td className={td}>{p.descripcion}</td>
                      <td className={td}>{p.subpartida}</td>
                      <td className={tdr}>{num(p.cantidadKg)}</td>
                      <td className={tdr}>{num(p.valorUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <TablaInsumos titulo="Insumos extranjeros" lineas={cuadro.insumosExtranjeros} total={cuadro.totales.extranjerosUsd} />
          <TablaInsumos titulo="Insumos nacionales" lineas={cuadro.insumosNacionales} total={cuadro.totales.nacionalesUsd} />

          <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <h3 className="px-4 py-2.5 text-sm font-semibold text-gray-900 bg-orange-50 border-b border-orange-100">Desperdicios</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={th}>Referencia</th>
                    <th className={th}>Descripción</th>
                    <th className={th}>Un.</th>
                    <th className={`${th} text-right`}>Cantidad</th>
                    <th className={`${th} text-right`}>Peso neto kg</th>
                    <th className={`${th} text-right`}>Valor US$</th>
                  </tr>
                </thead>
                <tbody>
                  {cuadro.desperdicios.map((d) => (
                    <tr key={d.referencia}>
                      <td className={`${td} font-medium`}>{d.referencia}</td>
                      <td className={td}>{d.descripcion}</td>
                      <td className={td}>{d.unidad}</td>
                      <td className={tdr}>{num(d.cantidad, 3)}</td>
                      <td className={tdr}>{num(d.pesoNetoKg)}</td>
                      <td className={tdr}>{num(d.valorUsd)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50">
                    <td className={`${td} font-semibold`} colSpan={4}>
                      Total desperdicios
                    </td>
                    <td className={`${tdr} font-semibold`}>{num(cuadro.totales.desperdiciosKg)}</td>
                    <td className={td} />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <h3 className="px-4 py-2.5 text-sm font-semibold text-gray-900 bg-orange-50 border-b border-orange-100">Participación en el valor del producto</h3>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Concepto</th>
                  <th className={`${th} text-right`}>Valor US$</th>
                  <th className={`${th} text-right`}>Participación</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={td}>Insumos extranjeros</td>
                  <td className={tdr}>{num(cuadro.totales.extranjerosUsd)}</td>
                  <td className={tdr}>{pct(cuadro.totales.participacionExtranjeraPct)}</td>
                </tr>
                <tr>
                  <td className={td}>Insumos nacionales</td>
                  <td className={tdr}>{num(cuadro.totales.nacionalesUsd)}</td>
                  <td className={tdr}>{pct(cuadro.totales.participacionNacionalPct)}</td>
                </tr>
                {cuadro.otrosCostos.map((c) => (
                  <tr key={c.concepto}>
                    <td className={td}>{c.concepto}</td>
                    <td className={tdr}>{num(c.valorUsd)}</td>
                    <td className={td} />
                  </tr>
                ))}
                <tr>
                  <td className={td}>Otros costos</td>
                  <td className={tdr}>{num(cuadro.totales.otrosUsd)}</td>
                  <td className={tdr}>{pct(cuadro.totales.participacionOtrosPct)}</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className={`${td} font-semibold`}>Valor del producto</td>
                  <td className={`${tdr} font-semibold`}>{num(cuadro.totales.productoUsd)}</td>
                  <td className={`${tdr} font-semibold`}>100.00 %</td>
                </tr>
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
