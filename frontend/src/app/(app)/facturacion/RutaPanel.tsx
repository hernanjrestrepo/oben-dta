'use client';

import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import type { LiquidacionDraft, LiquidacionHeaderValues, LiquidacionTotalesInput, OpcionInland, OpcionMaritima, RutaLiquidacion } from '@/types';
import { AlertCircle, Anchor, CheckCircle2, History, Loader2, RotateCcw, Route, Truck } from 'lucide-react';
import { Card, CardHeader, btnPrimary, btnSecondary, fecha, inputCls, usd } from './ui';

const ciudad = (puerto: string) => puerto.split(/,| - |\(/)[0].trim();
const TODOS = '';

/**
 * COMEX escoge la ruta de la liquidación DEL TARIFARIO (reunión del 15-oct):
 * puerto de origen, puerto de destino, agente, naviera y transportador
 * terrestre. Nada se digita. La sugerida es la más barata vigente al puerto
 * de la proforma; cada cambio queda como orden de compra interna numerada,
 * con sobrecosto y motivo (opcional).
 */
export function RutaPanel({
  pf,
  ruta,
  esUSA,
  input,
  onDraft,
}: {
  pf: string;
  ruta: RutaLiquidacion;
  esUSA: boolean;
  input: { header?: LiquidacionHeaderValues; totales?: LiquidacionTotalesInput };
  onDraft: (d: LiquidacionDraft) => void;
}) {
  const { opciones, actual, sugerida, contenedores } = ruta;
  const [maritimaId, setMaritimaId] = useState<string | null>(null);
  const [inlandId, setInlandId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState({ origen: TODOS, destino: TODOS, agente: TODOS, naviera: TODOS });
  const [verHistorial, setVerHistorial] = useState(false);

  // Lo que el usuario está escogiendo (sin aplicar) o, si no ha tocado nada, lo vigente.
  const marSel = maritimaId ?? actual.maritimaId;
  const inlSel = inlandId ?? actual.inlandId;
  const maritima = opciones.maritimas.find((o) => o.id === marSel) ?? null;
  const inland = opciones.inland.find((o) => o.id === inlSel) ?? null;
  const pendiente = (maritimaId !== null && maritimaId !== actual.maritimaId) || (inlandId !== null && inlandId !== actual.inlandId);

  const valores = (k: 'origen' | 'destino' | 'forwarder' | 'naviera') =>
    [...new Set(opciones.maritimas.map((o) => (k === 'origen' || k === 'destino' ? o[k] : (o[k] ?? '—'))))].sort();
  const maritimasFiltradas = opciones.maritimas.filter(
    (o) =>
      (!filtro.origen || o.origen === filtro.origen) &&
      (!filtro.destino || o.destino === filtro.destino) &&
      (!filtro.agente || (o.forwarder ?? '—') === filtro.agente) &&
      (!filtro.naviera || (o.naviera ?? '—') === filtro.naviera),
  );
  const costoSeleccion = useMemo(() => {
    if (!maritima && !inland) return null;
    return ((maritima?.flete ?? 0) + (inland?.valor ?? 0)) * contenedores;
  }, [maritima, inland, contenedores]);
  const sobrecostoSeleccion = costoSeleccion !== null && sugerida.costo !== null ? costoSeleccion - sugerida.costo : null;

  function escogerMaritima(o: OpcionMaritima) {
    setMaritimaId(o.id);
    // Si el Inland escogido no sale del puerto donde llega este marítimo, se deja que el sistema escoja el que empalma.
    if (inland && ciudad(inland.puerto).toLowerCase() !== ciudad(o.destino).toLowerCase()) setInlandId(null);
  }

  async function aplicar(volverASugerida = false) {
    try {
      setGuardando(true);
      setError('');
      const empalma = (i: OpcionInland | null) => !!i && !!maritima && ciudad(i.puerto).toLowerCase() === ciudad(maritima.destino).toLowerCase();
      const cambio = volverASugerida
        ? { maritimaId: null, inlandId: null, motivo: motivo.trim() || null }
        : {
            maritimaId: marSel,
            // Un Inland que no empalma con el marítimo no se guarda: el sistema toma el que sale de ese puerto.
            inlandId: esUSA && (empalma(inland) || !maritima) ? inlSel : null,
            motivo: motivo.trim() || null,
          };
      onDraft(await api.cambiarRutaLiquidacion(pf, cambio, input));
      setMaritimaId(null);
      setInlandId(null);
      setMotivo('');
    } catch (err) {
      setError(extractMessage(err, 'No se pudo guardar la ruta.'));
    } finally {
      setGuardando(false);
    }
  }

  const sinOpciones = opciones.maritimas.length === 0 && opciones.inland.length === 0;

  return (
    <Card>
      <CardHeader
        icon={<Route className="w-4 h-4 text-[#F47735]" />}
        title="2 · Ruta y tarifas (del tarifario)"
        subtitle="Sugerida: la más barata vigente al puerto de la proforma. COMEX puede escoger otro puerto, agente, naviera o transportador; el valor sale siempre del tarifario."
        right={
          actual.escogidaPorComex ? (
            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold">Escogida por COMEX</span>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">Sugerida</span>
          )
        }
      />
      <div className="p-4 space-y-4">
        {sinOpciones ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
            El tarifario no tiene tarifas para esta ruta. Hay que cargar el archivo de fletes vigente.
          </p>
        ) : (
          <>
            {/* Resumen: actual vs sugerida */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <Resumen label="Ruta sugerida" valor={usd(sugerida.costo)} />
              <Resumen label={pendiente ? 'Ruta escogida (sin aplicar)' : 'Ruta actual'} valor={usd(pendiente ? costoSeleccion : actual.costo)} />
              <Resumen
                label="Sobrecosto"
                valor={usd(pendiente ? sobrecostoSeleccion : ruta.sobrecosto)}
                tono={(pendiente ? sobrecostoSeleccion : ruta.sobrecosto) ?? 0}
              />
            </div>
            {contenedores > 1 && <p className="text-[11px] text-gray-500">Valores por {contenedores} contenedores de 40 pies.</p>}

            {/* Marítimo */}
            <div>
              <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-2">
                <Anchor className="w-3.5 h-3.5 text-[#F47735]" /> Flete marítimo (pata 2): puerto de origen → puerto de destino, agente y naviera
              </p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <Filtro label="Puerto de origen" valor={filtro.origen} opciones={valores('origen')} onChange={(v) => setFiltro((f) => ({ ...f, origen: v }))} />
                <Filtro label="Puerto de destino" valor={filtro.destino} opciones={valores('destino')} onChange={(v) => setFiltro((f) => ({ ...f, destino: v }))} />
                <Filtro label="Agente" valor={filtro.agente} opciones={valores('forwarder')} onChange={(v) => setFiltro((f) => ({ ...f, agente: v }))} />
                <Filtro label="Naviera" valor={filtro.naviera} opciones={valores('naviera')} onChange={(v) => setFiltro((f) => ({ ...f, naviera: v }))} />
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500 sticky top-0">
                    <tr>
                      <th className="w-8" />
                      <th className="px-2 py-1.5 text-left font-semibold">Ruta</th>
                      <th className="px-2 py-1.5 text-left font-semibold">Agente / naviera</th>
                      <th className="px-2 py-1.5 text-right font-semibold">USD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {maritimasFiltradas.map((o) => (
                      <tr key={o.id} onClick={() => escogerMaritima(o)} className={`cursor-pointer ${o.id === marSel ? 'bg-orange-50' : 'hover:bg-gray-50'}`}>
                        <td className="pl-2">
                          <input type="radio" readOnly checked={o.id === marSel} className="accent-[#F47735]" aria-label={`Escoger ${o.forwarder} ${o.naviera} ${o.flete}`} />
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="font-medium text-gray-900">{ciudad(o.origen)}</span> → <span className="font-medium text-gray-900">{o.destino}</span>
                          {o.transito && <span className="block text-[10px] text-gray-400">vía {ciudad(o.transito)}</span>}
                          <Marcas id={o.id} sugeridaId={sugerida.maritimaId} actualId={actual.maritimaId} vencida={o.vencida} validUntil={o.validUntil} />
                        </td>
                        <td className="px-2 py-1.5 text-gray-700">
                          {o.forwarder ?? '—'}
                          <span className="block text-[10px] text-gray-400">{o.naviera ?? ''}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-gray-900">{usd(o.flete)}</td>
                      </tr>
                    ))}
                    {maritimasFiltradas.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-3 text-center text-gray-400">
                          Ninguna tarifa con esos filtros.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Inland */}
            {esUSA && opciones.inland.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-2">
                  <Truck className="w-3.5 h-3.5 text-[#F47735]" /> Inland (pata 3): transportador terrestre hasta el cliente
                </p>
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-gray-100">
                      {opciones.inland.map((o) => {
                        const empalma = !maritima || ciudad(o.puerto).toLowerCase() === ciudad(maritima.destino).toLowerCase();
                        return (
                          <tr
                            key={o.id}
                            onClick={() => empalma && setInlandId(o.id)}
                            className={`${empalma ? 'cursor-pointer hover:bg-gray-50' : 'opacity-40 cursor-not-allowed'} ${o.id === inlSel ? 'bg-orange-50' : ''}`}
                            title={empalma ? undefined : `Sale de ${o.puerto}: no empalma con el marítimo escogido (llega a ${maritima?.destino})`}
                          >
                            <td className="pl-2 w-8">
                              <input type="radio" readOnly disabled={!empalma} checked={o.id === inlSel} className="accent-[#F47735]" aria-label={`Escoger Inland ${o.forwarder}`} />
                            </td>
                            <td className="px-2 py-1.5">
                              <span className="font-medium text-gray-900">{o.forwarder ?? '—'}</span> desde {o.puerto}
                              <Marcas id={o.id} sugeridaId={sugerida.inlandId} actualId={actual.inlandId} vencida={o.vencida} validUntil={o.validUntil} />
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-gray-900">{usd(o.valor)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Aplicar */}
            {(pendiente || actual.escogidaPorComex) && (
              <div className="rounded-lg border border-orange-200 bg-orange-50/40 p-3 space-y-2">
                <label className="block text-xs font-medium text-gray-700">
                  Justificación del cambio <span className="text-gray-400 font-normal">(opcional)</span>
                  <input
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    maxLength={500}
                    placeholder="Ej: espacio en el booking, tiempo de tránsito, pedido del cliente"
                    className={`${inputCls} w-full mt-1`}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {pendiente && (
                    <button className={btnPrimary} onClick={() => void aplicar()} disabled={guardando}>
                      {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Aplicar ruta
                    </button>
                  )}
                  {pendiente && (
                    <button
                      className={btnSecondary}
                      onClick={() => {
                        setMaritimaId(null);
                        setInlandId(null);
                      }}
                      disabled={guardando}
                    >
                      Descartar
                    </button>
                  )}
                  {actual.escogidaPorComex && !pendiente && (
                    <button className={btnSecondary} onClick={() => void aplicar(true)} disabled={guardando}>
                      <RotateCcw className="w-4 h-4" /> Volver a la sugerida
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-gray-500">Cada cambio queda registrado como orden de compra interna (quién, cuándo, antes → después, sobrecosto y motivo) y pide aprobar de nuevo.</p>
              </div>
            )}
            {error && (
              <p className="text-xs text-red-700 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> {error}
              </p>
            )}

            {/* Historial = órdenes de compra internas */}
            {ruta.historial.length > 0 && (
              <div>
                <button className="text-xs text-[#E5641F] hover:underline inline-flex items-center gap-1" onClick={() => setVerHistorial((v) => !v)}>
                  <History className="w-3.5 h-3.5" /> {verHistorial ? 'Ocultar' : 'Ver'} cambios de ruta ({ruta.historial.length})
                </button>
                {verHistorial && (
                  <ul className="mt-2 space-y-2">
                    {ruta.historial.map((c) => (
                      <li key={c.numero} className="rounded-lg border border-gray-200 p-2.5 text-[11px] text-gray-700">
                        <p className="font-semibold text-gray-900">
                          OC interna #{c.numero} · {fecha(c.fecha)} · {c.por ?? 'sin usuario'}
                          {c.sobrecosto !== null && c.sobrecosto !== 0 && (
                            <span className={c.sobrecosto > 0 ? 'text-red-700' : 'text-emerald-700'}> · sobrecosto {usd(c.sobrecosto)}</span>
                          )}
                        </p>
                        <p>
                          <span className="text-gray-400">Antes:</span> {c.antes}
                        </p>
                        <p>
                          <span className="text-gray-400">Después:</span> {c.despues}
                        </p>
                        <p className={c.motivo ? '' : 'text-red-600'}>
                          <span className="text-gray-400">Motivo:</span> {c.motivo ?? 'sin justificación'}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function Resumen({ label, valor, tono = 0 }: { label: string; valor: string; tono?: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-2 py-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${tono > 0 ? 'text-red-700' : 'text-gray-900'}`}>{valor}</p>
    </div>
  );
}

function Filtro({ label, valor, opciones, onChange }: { label: string; valor: string; opciones: string[]; onChange: (v: string) => void }) {
  return (
    <label className="text-[11px] text-gray-500">
      {label}
      <select value={valor} onChange={(e) => onChange(e.target.value)} className={`${inputCls} w-full mt-0.5 text-xs py-1.5`}>
        <option value={TODOS}>Todos</option>
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Marcas({ id, sugeridaId, actualId, vencida, validUntil }: { id: string; sugeridaId: string | null; actualId: string | null; vencida: boolean; validUntil: string | null }) {
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {id === sugeridaId && <span className="px-1 rounded bg-emerald-100 text-emerald-800 text-[9px] font-semibold">SUGERIDA</span>}
      {id === actualId && id !== sugeridaId && <span className="px-1 rounded bg-amber-100 text-amber-800 text-[9px] font-semibold">EN USO</span>}
      {vencida && <span className="px-1 rounded bg-red-50 text-red-700 text-[9px] font-semibold">venció {validUntil}</span>}
    </span>
  );
}
