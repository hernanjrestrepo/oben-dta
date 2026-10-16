'use client';

import { useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import type { LiquidacionDraft, LiquidacionHeaderValues, LiquidacionTotalesInput, OpcionInland, OpcionMaritima, RutaLiquidacion } from '@/types';
import { AlertCircle, Anchor, CheckCircle2, History, Landmark, Loader2, Paperclip, X, Receipt, RotateCcw, Truck } from 'lucide-react';
import { Card, CardHeader, btnPrimary, btnSecondary, fecha, inputCls, isNum, usd } from './ui';

const ciudad = (puerto: string) => puerto.split(/,| - |\(/)[0].trim().toLowerCase();
const TODOS = '';

type Entrada = { header?: LiquidacionHeaderValues; totales?: LiquidacionTotalesInput };

/** Guarda la ruta (solo ids del tarifario) y devuelve la liquidación recalculada. */
function useGuardarRuta(pf: string, input: Entrada, onDraft: (d: LiquidacionDraft) => void) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  async function guardar(cambio: { maritimaId: string | null; inlandId: string | null; aduanaId?: string | null; motivo: string | null }, archivos: File[] = []) {
    try {
      setGuardando(true);
      setError('');
      const d = await api.cambiarRutaLiquidacion(pf, cambio, input);
      const nuevo = d.ruta?.historial[0];
      if (archivos.length && nuevo) {
        try {
          d.ruta!.historial = await api.subirAdjuntosRuta(pf, nuevo.numero, archivos);
        } catch (err) {
          onDraft(d);
          setError(extractMessage(err, 'El cambio quedó guardado, pero los adjuntos no se pudieron subir.'));
          return true;
        }
      }
      onDraft(d);
      return true;
    } catch (err) {
      setError(extractMessage(err, 'No se pudo guardar la ruta.'));
      return false;
    } finally {
      setGuardando(false);
    }
  }
  return { guardar, guardando, error };
}

/**
 * Flete marítimo (pata 2): COMEX escoge DEL TARIFARIO el puerto de origen,
 * el de destino, el agente y la naviera (reunión del 15-oct). Nada se
 * digita. La sugerida es la más barata vigente al puerto de la proforma.
 */
export function RutaMaritimaCard({ pf, ruta, input, onDraft }: { pf: string; ruta: RutaLiquidacion; input: Entrada; onDraft: (d: LiquidacionDraft) => void }) {
  const { opciones, actual, sugerida, contenedores } = ruta;
  const [sel, setSel] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [archivos, setArchivos] = useState<File[]>([]);
  const [filtro, setFiltro] = useState({ origen: TODOS, destino: TODOS, agente: TODOS, naviera: TODOS });
  const { guardar, guardando, error } = useGuardarRuta(pf, input, onDraft);

  const marSel = sel ?? actual.maritimaId;
  const elegida = opciones.maritimas.find((o) => o.id === marSel) ?? null;
  const pendiente = sel !== null && sel !== actual.maritimaId;
  const valores = (k: 'origen' | 'destino' | 'forwarder' | 'naviera') => [...new Set(opciones.maritimas.map((o) => o[k] ?? '—'))].sort();
  const filas = opciones.maritimas.filter(
    (o) =>
      (!filtro.origen || o.origen === filtro.origen) &&
      (!filtro.destino || o.destino === filtro.destino) &&
      (!filtro.agente || (o.forwarder ?? '—') === filtro.agente) &&
      (!filtro.naviera || (o.naviera ?? '—') === filtro.naviera),
  );
  const sugeridaOp = opciones.maritimas.find((o) => o.id === sugerida.maritimaId) ?? null;
  const sobrecosto = elegida && sugeridaOp ? (elegida.flete - sugeridaOp.flete) * contenedores : null;

  async function aplicar(volver = false) {
    // Si el Inland escogido por COMEX no sale del puerto donde llega el marítimo nuevo, el sistema toma el que empalma.
    const inlandOk =
      actual.inlandPorComex && elegida && opciones.inland.some((i) => i.id === actual.inlandId && ciudad(i.puerto) === ciudad(elegida.destino));
    const ok = await guardar(
      volver
        ? { maritimaId: null, inlandId: actual.inlandPorComex ? actual.inlandId : null, aduanaId: actual.aduanaPorComex ? actual.aduanaId : null, motivo: motivo.trim() || null }
        : { maritimaId: marSel, inlandId: inlandOk ? actual.inlandId : null, aduanaId: actual.aduanaPorComex ? actual.aduanaId : null, motivo: motivo.trim() || null },
      archivos,
    );
    if (ok) {
      setSel(null);
      setMotivo('');
      setArchivos([]);
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<Anchor className="w-4 h-4 text-[#F47735]" />}
        title="2 · Flete marítimo"
        subtitle="Del tarifario: puerto de origen → puerto de destino, agente y naviera. La sugerida es la más barata vigente al puerto de la proforma."
        right={<EstadoBadge comex={actual.maritimaPorComex} />}
      />
      <div className="p-4 space-y-3">
        {opciones.maritimas.length === 0 ? (
          <SinTarifas />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
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
                    <th className="px-2 py-1.5 text-right font-semibold">Días</th>
                    <th className="px-2 py-1.5 text-right font-semibold">USD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filas.map((o: OpcionMaritima) => (
                    <tr key={o.id} onClick={() => setSel(o.id)} className={`cursor-pointer ${o.id === marSel ? 'bg-orange-50' : 'hover:bg-gray-50'}`}>
                      <td className="pl-2">
                        <input type="radio" readOnly checked={o.id === marSel} className="accent-[#F47735]" aria-label={`Escoger ${o.forwarder} ${o.naviera}`} />
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="font-medium text-gray-900">{o.origen.split(',')[0]}</span> → <span className="font-medium text-gray-900">{o.destino}</span>
                        {o.transito && <span className="block text-[10px] text-gray-400">vía {o.transito.split(',')[0]}</span>}
                        <Marcas id={o.id} sugeridaId={sugerida.maritimaId} actualId={actual.maritimaId} vencida={o.vencida} validUntil={o.validUntil} />
                      </td>
                      <td className="px-2 py-1.5 text-gray-700">
                        {o.forwarder ?? '—'}
                        <span className="block text-[10px] text-gray-400">{o.naviera ?? ''}</span>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-gray-700">{isNum(o.dias) ? o.dias : '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-gray-900">{usd(o.flete)}</td>
                    </tr>
                  ))}
                  {filas.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-3 text-center text-gray-400">
                        Ninguna tarifa con esos filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {contenedores > 1 && <p className="text-[11px] text-gray-500">Valores por contenedor de 40 pies; esta proforma lleva {contenedores}.</p>}
            <Aplicar
              pendiente={pendiente}
              porComex={actual.maritimaPorComex}
              sobrecosto={pendiente ? sobrecosto : null}
              motivo={motivo}
              setMotivo={setMotivo}
              archivos={archivos}
              setArchivos={setArchivos}
              guardando={guardando}
              error={error}
              onAplicar={() => void aplicar()}
              onDescartar={() => setSel(null)}
              onVolver={() => void aplicar(true)}
            />
            <Historial pf={pf} ruta={ruta} />
          </>
        )}
      </div>
    </Card>
  );
}

/**
 * Otros gastos discriminados. USA: Inland (COMEX escoge el transportador
 * terrestre del tarifario) + Entry + ISF + HMF = Destination Charges = otros
 * gastos. Fuera de USA, si el Incoterm los pide, no hay tarifario: se digitan.
 */
export function OtrosGastosCard({
  pf,
  liq,
  input,
  onDraft,
  aplica,
  incoterm,
  otrosDigitados,
  setOtrosDigitados,
}: {
  pf: string;
  liq: LiquidacionDraft;
  input: Entrada;
  onDraft: (d: LiquidacionDraft) => void;
  aplica: boolean;
  incoterm: string | null;
  otrosDigitados: string;
  setOtrosDigitados: (v: string) => void;
}) {
  const ruta = liq.ruta;
  const [sel, setSel] = useState<string | null>(null);
  const [selAduana, setSelAduana] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [archivos, setArchivos] = useState<File[]>([]);
  const { guardar, guardando, error } = useGuardarRuta(pf, input, onDraft);

  const h = liq.header;
  const actual = ruta?.actual;
  const contenedores = ruta?.contenedores ?? 1;
  const maritima = ruta?.opciones.maritimas.find((o) => o.id === actual?.maritimaId) ?? null;
  const inlSel = sel ?? actual?.inlandId ?? null;
  // La comisión aduanera sigue al transportador, salvo que COMEX escoja otro agente aduanero.
  const aduSel = selAduana ?? (actual?.aduanaPorComex ? actual.aduanaId : inlSel);
  const pendiente = (sel !== null && sel !== actual?.inlandId) || (selAduana !== null && selAduana !== actual?.aduanaId);
  // Con el marítimo escogido por COMEX, solo los transportadores que salen de su puerto de llegada; si no, cualquiera (el marítimo lo sigue).
  const empalma = (o: OpcionInland) => !actual?.maritimaPorComex || !maritima || ciudad(o.puerto) === ciudad(maritima.destino);
  const inlandOpts = ruta?.opciones.inland ?? [];
  const aduanaOpts = inlandOpts.filter((o) => isNum(o.comisionAduanera));
  const elegido = inlandOpts.find((o) => o.id === inlSel) ?? null;
  const sugerido = inlandOpts.find((o) => o.id === ruta?.sugerida.inlandId) ?? null;
  const aduanaElegida = inlandOpts.find((o) => o.id === aduSel) ?? null;
  const aduanaSugerida = inlandOpts.find((o) => o.id === ruta?.sugerida.aduanaId) ?? null;
  const sobrecosto = pendiente && elegido && sugerido ? (elegido.valor - sugerido.valor) * contenedores : null;
  const sobrecostoAduana =
    pendiente && isNum(aduanaElegida?.comisionAduanera) && isNum(aduanaSugerida?.comisionAduanera)
      ? (aduanaElegida.comisionAduanera - aduanaSugerida.comisionAduanera) * contenedores
      : null;
  const sobre = sobrecosto !== null || sobrecostoAduana !== null ? (sobrecosto ?? 0) + (sobrecostoAduana ?? 0) : null;

  async function aplicar(volver = false) {
    const aduanaId = volver || !aduSel || aduSel === inlSel ? null : aduSel;
    const ok = await guardar({
      maritimaId: actual?.maritimaPorComex ? (actual.maritimaId ?? null) : null,
      inlandId: volver ? null : inlSel,
      aduanaId,
      motivo: motivo.trim() || null,
    }, archivos);
    if (ok) {
      setSel(null);
      setSelAduana(null);
      setMotivo('');
      setArchivos([]);
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<Receipt className="w-4 h-4 text-[#F47735]" />}
        title="3 · Pata 3: otros gastos en destino"
        subtitle={
          liq.esUSA
            ? 'Inland + Entry + ISF + HMF. COMEX puede cambiar el transportador terrestre y el agente aduanero (comisión aduanera).'
            : 'Transporte terrestre y gastos en destino del envío.'
        }
        right={liq.esUSA && actual ? <EstadoBadge comex={actual.inlandPorComex || actual.aduanaPorComex} /> : undefined}
      />
      <div className="p-4 space-y-3">
        {!aplica && <p className="text-xs text-gray-500">{incoterm ? `${incoterm} no lleva otros gastos: se informan pero no se descuentan de la mercancía.` : ''}</p>}
        {liq.esUSA ? (
          <>
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-gray-100">
                  <Concepto label="Inland (transporte terrestre)" detalle={elegido ? `${elegido.forwarder ?? ''} desde ${elegido.puerto}` : undefined} valor={h.inlandFreight} />
                  <Concepto label="Entry Fee" detalle="Fijo negociado en aduana" valor={h.entryFee} />
                  <Concepto label="Importer Security Filing (ISF)" detalle="Fijo negociado en aduana" valor={h.importerSecurityFiling} />
                  <Concepto label="Harbor Maintenance Fee (HMF)" detalle="0,125 % del FOB final" valor={h.harborMaintenanceFee} />
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-3 py-2 text-gray-900">Total otros gastos (Destination Charges)</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-900">{usd(h.destinationCharges)}</td>
                  </tr>
                  <Concepto
                    label="Comisión aduanera (agente aduanero)"
                    detalle={aduanaElegida ? `${aduanaElegida.forwarder ?? ''} · informativa: no suma a Destination Charges` : 'Sin tarifa en el tarifario'}
                    valor={isNum(aduanaElegida?.comisionAduanera) ? aduanaElegida.comisionAduanera * contenedores : null}
                  />
                </tbody>
              </table>
            </div>

            {inlandOpts.length > 0 ? (
              <>
                <div>
                  <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-2">
                    <Truck className="w-3.5 h-3.5 text-[#F47735]" /> Transportador terrestre (del tarifario)
                  </p>
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-gray-100">
                        {inlandOpts.map((o) => {
                          const ok = empalma(o);
                          return (
                            <tr
                              key={o.id}
                              onClick={() => ok && setSel(o.id)}
                              className={`${ok ? 'cursor-pointer hover:bg-gray-50' : 'opacity-40 cursor-not-allowed'} ${o.id === inlSel ? 'bg-orange-50' : ''}`}
                              title={ok ? undefined : `Sale de ${o.puerto}: no empalma con el marítimo escogido (llega a ${maritima?.destino})`}
                            >
                              <td className="pl-2 w-8">
                                <input type="radio" readOnly disabled={!ok} checked={o.id === inlSel} className="accent-[#F47735]" aria-label={`Escoger ${o.forwarder}`} />
                              </td>
                              <td className="px-2 py-1.5">
                                <span className="font-medium text-gray-900">{o.forwarder ?? '—'}</span> desde {o.puerto}
                                <Marcas id={o.id} sugeridaId={ruta?.sugerida.inlandId ?? null} actualId={actual?.inlandId ?? null} vencida={o.vencida} validUntil={o.validUntil} />
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-gray-900">{usd(o.valor)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {!actual?.maritimaPorComex && <p className="mt-1 text-[11px] text-gray-500">Si escoges un transportador de otro puerto, el flete marítimo se ajusta para llegar a ese puerto.</p>}
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-2">
                    <Landmark className="w-3.5 h-3.5 text-[#F47735]" /> Agente aduanero · comisión aduanera (del tarifario)
                  </p>
                  {aduanaOpts.length === 0 ? (
                    <p className="text-[11px] text-gray-500">El tarifario no trae comisión aduanera para este destino.</p>
                  ) : (
                    <div className="rounded-lg border border-gray-200 overflow-hidden">
                      <table className="w-full text-xs">
                        <tbody className="divide-y divide-gray-100">
                          {aduanaOpts.map((o) => (
                            <tr key={o.id} onClick={() => setSelAduana(o.id)} className={`cursor-pointer hover:bg-gray-50 ${o.id === aduSel ? 'bg-orange-50' : ''}`}>
                              <td className="pl-2 w-8">
                                <input type="radio" readOnly checked={o.id === aduSel} className="accent-[#F47735]" aria-label={`Escoger aduana ${o.forwarder}`} />
                              </td>
                              <td className="px-2 py-1.5">
                                <span className="font-medium text-gray-900">{o.forwarder ?? '—'}</span>
                                <Marcas id={o.id} sugeridaId={ruta?.sugerida.aduanaId ?? null} actualId={actual?.aduanaId ?? null} vencida={o.vencida} validUntil={o.validUntil} />
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-gray-900">{usd(o.comisionAduanera)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <SinTarifas />
            )}
            <Aplicar
              pendiente={pendiente}
              porComex={!!actual?.inlandPorComex || !!actual?.aduanaPorComex}
              sobrecosto={sobre}
              motivo={motivo}
              setMotivo={setMotivo}
              archivos={archivos}
              setArchivos={setArchivos}
              guardando={guardando}
              error={error}
              onAplicar={() => void aplicar()}
              onDescartar={() => {
                setSel(null);
                setSelAduana(null);
              }}
              onVolver={() => void aplicar(true)}
            />
          </>
        ) : aplica ? (
          <label className="block text-xs text-gray-600">
            Otros gastos (USD) — fuera de EE. UU. no hay tarifario de gastos en destino
            <input value={otrosDigitados} onChange={(e) => setOtrosDigitados(e.target.value)} inputMode="decimal" placeholder={usd(liq.totales.otrosGastos)} className={`${inputCls} w-full mt-1`} />
          </label>
        ) : (
          <p className="text-xs text-gray-500">Sin tarifas de transporte terrestre ni aduana para {liq.pais ?? 'este destino'}: el tarifario solo trae la pata 3 de EE. UU. y Canadá.</p>
        )}
      </div>
    </Card>
  );
}

function Concepto({ label, detalle, valor }: { label: string; detalle?: string; valor: unknown }) {
  return (
    <tr>
      <td className="px-3 py-2">
        <span className="text-gray-800">{label}</span>
        {detalle && <span className="block text-[10px] text-gray-400">{detalle}</span>}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-gray-900">{isNum(valor) ? usd(valor) : '—'}</td>
    </tr>
  );
}

function Aplicar(p: {
  pendiente: boolean;
  porComex: boolean;
  sobrecosto: number | null;
  motivo: string;
  setMotivo: (v: string) => void;
  archivos: File[];
  setArchivos: (v: File[]) => void;
  guardando: boolean;
  error: string;
  onAplicar: () => void;
  onDescartar: () => void;
  onVolver: () => void;
}) {
  if (!p.pendiente && !p.porComex && !p.error) return null;
  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50/40 p-3 space-y-2">
      {p.pendiente && p.sobrecosto !== null && (
        <p className={`text-xs font-semibold ${p.sobrecosto > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
          {p.sobrecosto > 0 ? `Sobrecosto frente a la sugerida: ${usd(p.sobrecosto)}` : p.sobrecosto < 0 ? `Ahorro frente a la sugerida: ${usd(-p.sobrecosto)}` : 'Mismo costo que la sugerida'}
        </p>
      )}
      <label className="block text-xs font-medium text-gray-700">
        Justificación del cambio <span className="text-gray-400 font-normal">(opcional)</span>
        <input value={p.motivo} onChange={(e) => p.setMotivo(e.target.value)} maxLength={500} placeholder="Ej: espacio en el booking, tiempo de tránsito, pedido del cliente" className={`${inputCls} w-full mt-1`} />
      </label>
      {p.pendiente && <Clip archivos={p.archivos} setArchivos={p.setArchivos} />}
      <div className="flex flex-wrap gap-2">
        {p.pendiente && (
          <>
            <button className={btnPrimary} onClick={p.onAplicar} disabled={p.guardando}>
              {p.guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Aplicar
            </button>
            <button className={btnSecondary} onClick={p.onDescartar} disabled={p.guardando}>
              Descartar
            </button>
          </>
        )}
        {p.porComex && !p.pendiente && (
          <button className={btnSecondary} onClick={p.onVolver} disabled={p.guardando}>
            <RotateCcw className="w-4 h-4" /> Volver a la sugerida
          </button>
        )}
      </div>
      {p.error && (
        <p className="text-xs text-red-700 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" /> {p.error}
        </p>
      )}
      <p className="text-[11px] text-gray-500">Cada cambio queda como orden de compra interna (quién, cuándo, antes → después, sobrecosto y motivo) y pide aprobar de nuevo.</p>
    </div>
  );
}

function Historial({ pf, ruta }: { pf: string; ruta: RutaLiquidacion }) {
  const [ver, setVer] = useState(false);
  if (ruta.historial.length === 0) return null;
  return (
    <div>
      <button className="text-xs text-[#E5641F] hover:underline inline-flex items-center gap-1" onClick={() => setVer((v) => !v)}>
        <History className="w-3.5 h-3.5" /> {ver ? 'Ocultar' : 'Ver'} cambios de ruta ({ruta.historial.length})
      </button>
      {ver && (
        <ul className="mt-2 space-y-2">
          {ruta.historial.map((c) => (
            <li key={c.numero} className="rounded-lg border border-gray-200 p-2.5 text-[11px] text-gray-700">
              <p className="font-semibold text-gray-900">
                OC interna #{c.numero} · {fecha(c.fecha)} · {c.por ?? 'sin usuario'}
                {c.sobrecosto !== null && c.sobrecosto !== 0 && <span className={c.sobrecosto > 0 ? 'text-red-700' : 'text-emerald-700'}> · sobrecosto {usd(c.sobrecosto)}</span>}
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
              <Soportes pf={pf} adjuntos={c.adjuntos ?? []} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EstadoBadge({ comex }: { comex: boolean }): ReactNode {
  return comex ? (
    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold">Escogido por COMEX</span>
  ) : (
    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">Sugerido</span>
  );
}

function SinTarifas() {
  return <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">El tarifario no tiene tarifas para esta ruta. Hay que cargar el archivo de fletes vigente.</p>;
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

const MAX_ADJUNTOS = 5;
const MAX_MB = 10;
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Clip: soportes de la justificación (cotización del forwarder, correo del booking…). Hasta 5 archivos de 10 MB. */
function Clip({ archivos, setArchivos }: { archivos: File[]; setArchivos: (v: File[]) => void }) {
  const [aviso, setAviso] = useState('');
  function agregar(lista: FileList | null) {
    const nuevos = Array.from(lista ?? []);
    const grandes = nuevos.filter((f) => f.size > MAX_MB * 1024 * 1024);
    const todos = [...archivos, ...nuevos.filter((f) => f.size <= MAX_MB * 1024 * 1024)].slice(0, MAX_ADJUNTOS);
    setAviso(grandes.length ? `${grandes.map((f) => f.name).join(', ')}: supera ${MAX_MB} MB.` : archivos.length + nuevos.length > MAX_ADJUNTOS ? `Máximo ${MAX_ADJUNTOS} archivos.` : '');
    setArchivos(todos);
  }
  return (
    <div>
      <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#C4521A] hover:underline cursor-pointer">
        <Paperclip className="w-3.5 h-3.5" /> Adjuntar soporte <span className="text-gray-400 font-normal">(cotización, correo del booking…)</span>
        <input type="file" multiple className="hidden" onChange={(e) => { agregar(e.target.files); e.target.value = ''; }} />
      </label>
      {archivos.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {archivos.map((f, i) => (
            <li key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white pl-2 pr-1 py-0.5 text-[11px] text-gray-700">
              <Paperclip className="w-3 h-3 text-gray-400" /> {f.name} <span className="text-gray-400">{kb(f.size)}</span>
              <button onClick={() => setArchivos(archivos.filter((_, j) => j !== i))} className="p-0.5 rounded hover:bg-gray-100" aria-label={`Quitar ${f.name}`}>
                <X className="w-3 h-3 text-gray-400" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {aviso && <p className="mt-1 text-[11px] text-amber-700">{aviso}</p>}
    </div>
  );
}

/** Soportes de un cambio de ruta: clic abre el archivo en otra pestaña. */
function Soportes({ pf, adjuntos }: { pf: string; adjuntos: Array<{ id: string; nombre: string; tamano: number }> }) {
  const [abriendo, setAbriendo] = useState<string | null>(null);
  if (!adjuntos.length) return null;
  async function abrir(id: string) {
    const ventana = window.open('', '_blank');
    try {
      setAbriendo(id);
      const url = URL.createObjectURL(await api.abrirAdjuntoRuta(pf, id));
      if (ventana) ventana.location.href = url;
      else window.open(url, '_blank');
    } catch {
      ventana?.close();
    } finally {
      setAbriendo(null);
    }
  }
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1.5">
      <span className="text-gray-400">Soportes:</span>
      {adjuntos.map((a) => (
        <button key={a.id} onClick={() => void abrir(a.id)} className="inline-flex items-center gap-1 text-[#C4521A] hover:underline" disabled={abriendo === a.id}>
          {abriendo === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />} {a.nombre} <span className="text-gray-400">({kb(a.tamano)})</span>
        </button>
      ))}
    </p>
  );
}
