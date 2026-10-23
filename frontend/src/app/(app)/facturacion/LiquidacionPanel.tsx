'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import { useAuthStore } from '@/store/auth';
import type {
  ConceptoLiquidacion,
  FacturacionDraft,
  IncotermRegla,
  LiquidacionDraft,
  LiquidacionHeaderValues,
  OrigenValor,
} from '@/types';
import { IncotermGuia } from './IncotermGuia';
import { OtrosGastosCard, RutaMaritimaCard } from './RutaPanel';
import { ProformaModal, TarifarioCard, VistaFacturaCard } from './ComexExtras';
import { AlertCircle, ArrowRight, BadgeCheck, FileText, Loader2, Ship, Sparkles } from 'lucide-react';
import {
  Card,
  CardHeader,
  Composicion,
  Faltantes,
  Field,
  Kpi,
  Listo,
  PendienteConfirmar,
  agruparFaltantes,
  btnPrimary,
  btnSecondary,
  inputCls,
  isNum,
  kg,
  num2,
  parseNum,
  unit,
  usd,
} from './ui';

export interface LiquidacionEstado {
  calculada: boolean;
  faltan: number;
  pendientes: number;
  incoterm: string | null;
  /** Término de pago de la proforma (Oben) y total de la factura (FOB final + flete + seguro + otros). */
  terminoPago?: string | null;
  totalFactura?: number | null;
}

const CONCEPTO_LABEL: Record<ConceptoLiquidacion, string> = { flete: 'Flete', seguro: 'Seguro', otrosGastos: 'Otros' };

const ORIGEN: Record<OrigenValor, { label: string; cls: string }> = {
  oben: { label: 'ERP Oben', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  maestro: { label: 'Maestro de tarifas', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  calculado: { label: 'Calculado', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  usuario: { label: 'Digitado', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
  provisional: { label: 'Provisional', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  comex: { label: 'Escogido por COMEX', cls: 'bg-orange-50 text-[#C4521A] border-orange-200' },
  cliente: { label: 'Del cliente', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
};

function OrigenBadge({ origen }: { origen?: OrigenValor }) {
  if (!origen) return null;
  const o = ORIGEN[origen];
  return <span className={`ml-1.5 inline-block px-1.5 py-px rounded border text-[10px] font-medium ${o.cls}`}>{o.label}</span>;
}

function descripcion(regla: IncotermRegla | undefined): string {
  if (!regla) return 'Escoge el Incoterm de la proforma: define qué valores se liquidan.';
  if (regla.conceptos.length === 0) return `${regla.codigo}: no se pide flete, seguro ni otros gastos — la mercancía se liquida tal cual.`;
  if (regla.conceptos.length === 1 && regla.conceptos[0] === 'flete') return `${regla.codigo}: solo se pide el flete.`;
  return `${regla.codigo}: se piden ${regla.conceptos.map((c) => (c === 'otrosGastos' ? 'otros gastos' : CONCEPTO_LABEL[c].toLowerCase())).join(', ')}.`;
}

type TextoKey = 'direccion' | 'puertoEmbarque' | 'puertoArribo' | 'paNcm' | 'paNaladi' | 'notes';
type MontoKey = 'inlandFreight' | 'entryFee' | 'importerSecurityFiling' | 'harborMaintenanceFee';

const TEXTOS: Array<[TextoKey, string, string]> = [
  ['puertoEmbarque', 'Puerto de embarque', 'Ej: Cartagena'],
  ['puertoArribo', 'Puerto de arribo', 'Ej: Callao'],
  ['paNcm', 'Partida arancelaria NCM', 'Ej: 3920.20'],
  ['paNaladi', 'Partida arancelaria NALADI', 'Ej: 3920.20.00'],
];

/**
 * Liquidación de comercio exterior con la fórmula de José (llamada y
 * respuestas del 30-sep): se recalcula en vivo contra el ERP de Oben a
 * medida que se digita. El envío real a Oben queda bloqueado mientras haya
 * puntos sin validar — aquí solo se simula.
 */
export function LiquidacionPanel({
  factura,
  onEstado,
  onContinuar,
}: {
  factura: FacturacionDraft;
  onEstado: (e: LiquidacionEstado) => void;
  onContinuar: () => void;
}) {
  const pf = factura.proforma;
  const [reglas, setReglas] = useState<IncotermRegla[] | null>(null);
  const [incoterm, setIncoterm] = useState<string | null>(null);
  const [otros, setOtros] = useState('');
  // La póliza vigente la pone el backend (José: 1.00053); ya no se digita en pantalla.
  const [poliza] = useState('');
  // Solo lo que el usuario editó: lo demás lo resuelve el backend (ERP, maestro, cálculo) y se muestra con su origen.
  const [textos, setTextos] = useState<Partial<Record<TextoKey, string>>>({});
  const [montos] = useState<Partial<Record<MontoKey, string>>>({});
  // Texto junto a la partida NCM en la factura (por cliente, 20-oct): undefined = lo que trae el sistema.
  const [ncmTexto, setNcmTexto] = useState<string | undefined>(undefined);
  const [ncmSin, setNcmSin] = useState<boolean | undefined>(undefined);
  const [verProforma, setVerProforma] = useState(false);

  const [liq, setLiq] = useState<LiquidacionDraft | null>(null);
  const [calculando, setCalculando] = useState(true);
  const [error, setError] = useState('');
  const reqId = useRef(0);
  const primera = useRef(true);
  const onEstadoRef = useRef(onEstado);
  useEffect(() => {
    onEstadoRef.current = onEstado;
  });

  useEffect(() => {
    api
      .getIncoterms()
      .then(setReglas)
      .catch(() => setReglas([]));
  }, []);

  const payload = useMemo(() => {
    const header: LiquidacionHeaderValues = {};
    for (const [k, v] of Object.entries(textos) as Array<[TextoKey, string]>) if (v.trim()) header[k] = v.trim();
    for (const [k, v] of Object.entries(montos) as Array<[MontoKey, string]>) {
      const n = parseNum(v);
      if (n !== null) header[k] = n;
    }
    return {
      header,
      // El flete nunca se digita: sale de la ruta escogida del tarifario (reunión del 15-oct).
      totales: { incoterm, otrosGastos: parseNum(otros), valorPoliza: parseNum(poliza) },
      factura: {
        ...(ncmTexto !== undefined && ncmTexto.trim() ? { ncmDescripcion: ncmTexto.trim() } : {}),
        ...(ncmSin !== undefined ? { ncmConDescripcion: !ncmSin } : {}),
      },
    };
  }, [textos, montos, incoterm, otros, poliza, ncmTexto, ncmSin]);

  useEffect(() => {
    if (!pf) return;
    const id = ++reqId.current;
    const delay = primera.current ? 0 : 450;
    primera.current = false;
    const t = setTimeout(() => {
      setCalculando(true);
      api
        .getLiquidacionDraft(pf, payload)
        .then((d) => {
          if (id !== reqId.current) return;
          setLiq(d);
          setError('');
          const n = (v?: number | null) => (isNum(v) ? v : 0);
          const totalFactura = d.lines.every((l) => isNum(l.valueFOB))
            ? Math.round(d.lines.reduce((a, l) => a + n(l.valueFOB) + n(l.valueFreight) + n(l.valueSure) + n(l.expensesOther), 0) * 100) / 100
            : null;
          onEstadoRef.current({
            calculada: true,
            faltan: agruparFaltantes(d.missing).visibles.length,
            pendientes: d.sinConfirmar.length,
            incoterm: d.incoterm,
            terminoPago: d.terminoPago ?? null,
            totalFactura,
          });
        })
        .catch((err) => {
          if (id === reqId.current) setError(extractMessage(err, 'No se pudo calcular la liquidación con los datos de Oben.'));
        })
        .finally(() => {
          if (id === reqId.current) setCalculando(false);
        });
    }, delay);
    return () => clearTimeout(t);
  }, [pf, payload]);

  /** COMEX guardó una ruta: se muestra la liquidación recalculada y se descarta cualquier cálculo en vuelo. */
  function alGuardarRuta(d: LiquidacionDraft) {
    reqId.current++;
    setLiq(d);
  }

  const puedeAprobar = !!useAuthStore.getState().user?.permissions?.includes('exportations.approve');
  const [aprobando, setAprobando] = useState(false);

  async function aprobar() {
    if (!pf) return;
    try {
      setAprobando(true);
      setError('');
      setLiq(await api.approveLiquidacion(pf, payload));
    } catch (err) {
      setError(extractMessage(err, 'No se pudo aprobar la liquidación.'));
    } finally {
      setAprobando(false);
    }
  }


  if (!pf) {
    return (
      <Card className="p-6">
        <p className="text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> La orden no trae número de Proforma en Oben: sin él no se puede liquidar.
        </p>
      </Card>
    );
  }

  // Lo escogido manda; si no, el Incoterm que trae Oben para la proforma.
  const incotermEfectivo = incoterm ?? liq?.incoterm ?? null;
  const delErp = !incoterm && liq?.incotermOrigen === 'oben';
  const regla = reglas?.find((r) => r.codigo === incotermEfectivo);
  const pide = (c: ConceptoLiquidacion) => !!regla?.conceptos.includes(c);
  const lines = liq?.lines ?? [];
  const suma = (f: (l: (typeof lines)[number]) => number | null | undefined) =>
    lines.every((l) => isNum(f(l))) ? lines.reduce((a, l) => a + (f(l) as number), 0) : null;
  const tot = {
    kilos: suma((l) => l.kilosTotal),
    valor: suma((l) => l.valueTotal),
    flete: suma((l) => l.valueFreight),
    seguro: suma((l) => l.valueSure),
    otros: suma((l) => l.expensesOther),
    fob: suma((l) => l.valueFOB),
  };
  // Total de la factura = FOB final + flete + seguro + otros (José, 20-oct: 60,796 + 324 = 61,120 cerrado).
  const totalFactura = isNum(tot.fob) ? Math.round((tot.fob + (tot.flete ?? 0) + (tot.seguro ?? 0) + (tot.otros ?? 0)) * 100) / 100 : null;
  const textoValor = (k: TextoKey) => textos[k] ?? String(liq?.header[k] ?? '');
  const origen = (k: keyof LiquidacionHeaderValues) => (textos[k as TextoKey] !== undefined || montos[k as MontoKey] !== undefined ? 'usuario' : liq?.headerOrigen[k]);
  const faltantes = agruparFaltantes(liq?.missing ?? []);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          icon={<Ship className="w-4 h-4 text-[#F47735]" />}
          title="1 · Incoterm de la proforma"
          subtitle="Qué incluye y hasta dónde va (Incoterms 2020). Define qué se liquida."
          right={
            <button
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F47735] text-white text-sm font-semibold shadow-sm hover:bg-[#E5641F] focus:outline-none focus:ring-2 focus:ring-[#F47735]/40"
              onClick={() => setVerProforma(true)}
              title="La proforma tal como está en OBEN MAS (puertos, Incoterm, término de pago, precios)"
            >
              <FileText className="w-4 h-4" /> Ver proforma
            </button>
          }
        />
        <div className="p-4">
          <IncotermGuia
            reglas={reglas}
            seleccionado={incotermEfectivo}
            delErp={delErp}
            onSeleccionar={(c) => setIncoterm(c === incoterm ? null : c)}
          />
          <p className="mt-3 text-xs text-gray-600">{descripcion(regla)}</p>
        </div>
      </Card>

    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      {/* ── Datos ── */}
      <div className="xl:col-span-5 space-y-5">

        {liq?.ruta && (
          <RutaMaritimaCard pf={pf} ruta={liq.ruta} input={payload} onDraft={alGuardarRuta} />
        )}

        {liq && (
          <OtrosGastosCard
            pf={pf}
            liq={liq}
            input={payload}
            onDraft={alGuardarRuta}
            aplica={!regla || pide('otrosGastos')}
            incoterm={regla?.codigo ?? null}
            otrosDigitados={otros}
            setOtrosDigitados={setOtros}
          />
        )}

        <Card>
          <CardHeader title={`${liq?.ruta ? '4' : '2'} · Encabezado`} subtitle="Dirección y puertos vienen del ERP de Oben; se pueden modificar." />
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              className="sm:col-span-2"
              label={
                <>
                  Dirección <OrigenBadge origen={origen('direccion')} />
                </>
              }
              hint={
                !textoValor('direccion') && factura.direccionEntrega ? (
                  <button className="text-[#E5641F] hover:underline" onClick={() => setTextos((t) => ({ ...t, direccion: factura.direccionEntrega! }))}>
                    Usar la dirección de entrega del pedido
                  </button>
                ) : undefined
              }
            >
              <input value={textoValor('direccion')} onChange={(e) => setTextos((t) => ({ ...t, direccion: e.target.value }))} className={`${inputCls} w-full`} placeholder="Dirección del consignatario" />
            </Field>
            {TEXTOS.map(([k, label, ph]) => (
              <Field
                key={k}
                label={
                  <>
                    {label} <OrigenBadge origen={origen(k)} />
                  </>
                }
              >
                <input value={textoValor(k)} onChange={(e) => setTextos((t) => ({ ...t, [k]: e.target.value }))} className={`${inputCls} w-full`} placeholder={ph} />
              </Field>
            ))}
            <Field
              className="sm:col-span-2"
              label={
                <>
                  Junto a la partida NCM en la factura <OrigenBadge origen={ncmTexto !== undefined || ncmSin !== undefined ? 'usuario' : (liq?.factura?.origen ?? undefined)} />
                </>
              }
              hint={
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ncmSin ?? liq?.factura?.ncmConDescripcion === false}
                    onChange={(e) => setNcmSin(e.target.checked)}
                  />
                  Sin nombre del producto (la partida va sola). Lo que dejes queda para este cliente.
                </label>
              }
            >
              <input
                value={ncmTexto ?? liq?.factura?.ncmDescripcion ?? ''}
                onChange={(e) => setNcmTexto(e.target.value)}
                disabled={ncmSin ?? liq?.factura?.ncmConDescripcion === false}
                className={`${inputCls} w-full disabled:bg-gray-50 disabled:text-gray-400`}
                placeholder={liq?.factura?.ncmDescripcionPorDefecto ? `Por defecto: ${liq.factura.ncmDescripcionPorDefecto}` : 'Descripción de la película (por defecto la de Oben)'}
              />
            </Field>
            <Field label="Notas (opcional)" className="sm:col-span-2">
              <input value={textoValor('notes')} onChange={(e) => setTextos((t) => ({ ...t, notes: e.target.value }))} className={`${inputCls} w-full`} />
            </Field>
          </div>
        </Card>

        <TarifarioCard puedeCargar={puedeAprobar} onCargado={() => setTextos((t) => ({ ...t }))} />
      </div>

      {/* ── Resultado ── */}
      <div className="xl:col-span-7 space-y-5">
        <Card>
          <CardHeader
            title={`Resultado de la liquidación · PF ${pf}`}
            subtitle={liq ? `${liq.cliente} · ${liq.pais ?? 'país sin resolver'} · precios y kilos del ERP de Oben (spCheckSettlement)` : 'Consultando el ERP de Oben…'}
            right={
              calculando ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Recalculando
                </span>
              ) : liq?.incoterm ? (
                <span className="px-2 py-0.5 rounded-full bg-orange-50 text-[#C4521A] text-xs font-bold tracking-wider">{liq.incoterm}</span>
              ) : null
            }
          />
          <div className="p-4 space-y-4">
            {error && (
              <p className="text-sm text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </p>
            )}
            {!liq && !error && (
              <div className="space-y-2">
                <div className="h-16 rounded-lg bg-gray-100 animate-pulse" />
                <div className="h-32 rounded-lg bg-gray-100 animate-pulse" />
              </div>
            )}
            {liq && (
              <>
                {/* Sin "Valor mercancía" (Hernán, 23-oct: "solo confunde"): el resultado es el FOB final y el total. */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <Kpi label="Flete" value={usd(tot.flete)} tone={isNum(tot.flete) ? 'default' : 'muted'} />
                  <Kpi label="Seguro" value={usd(tot.seguro)} tone={isNum(tot.seguro) ? 'default' : 'muted'} />
                  <Kpi label="Otros gastos" value={usd(tot.otros)} tone={isNum(tot.otros) ? 'default' : 'muted'} />
                  <Kpi label="FOB final" value={usd(tot.fob)} tone={isNum(tot.fob) ? 'brand' : 'muted'} />
                  <Kpi label={`Total ${liq.incoterm ?? 'factura'}`} value={usd(totalFactura)} tone={isNum(totalFactura) ? 'brand' : 'muted'} />
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600">
                  <span>
                    <span className="text-gray-400">Término de pago:</span>{' '}
                    <span className={liq.terminoPago ? 'font-medium text-gray-900' : 'text-amber-700'}>{liq.terminoPago ?? 'Oben no lo trae para esta proforma'}</span>
                  </span>
                  <span>
                    <span className="text-gray-400">Orden de compra del cliente:</span> <span className="font-medium text-gray-900">{liq.ordenCompra || '—'}</span>
                  </span>
                </div>

                {isNum(tot.fob) && (
                  <Composicion
                    partes={[
                      { label: 'FOB final', valor: tot.fob, color: 'bg-emerald-500' },
                      { label: 'Flete', valor: tot.flete ?? 0, color: 'bg-[#F47735]' },
                      { label: 'Seguro', valor: tot.seguro ?? 0, color: 'bg-sky-500' },
                      { label: 'Otros gastos', valor: tot.otros ?? 0, color: 'bg-violet-500' },
                    ]}
                  />
                )}

                <div className="overflow-x-auto -mx-4">
                  <table className="w-full text-xs text-gray-800 whitespace-nowrap">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500">
                        <th className="px-4 py-2 text-left font-semibold">Película</th>
                        <th className="px-3 py-2 text-right font-semibold">Kilos</th>
                        <th className="px-3 py-2 text-right font-semibold">Precio/kg</th>
                        <th className="px-3 py-2 text-right font-semibold">Valor total</th>
                        <th className="px-3 py-2 text-right font-semibold">Flete</th>
                        <th className="px-3 py-2 text-right font-semibold">Seguro</th>
                        <th className="px-3 py-2 text-right font-semibold">Otros</th>
                        <th className="px-3 py-2 text-right font-semibold">FOB final</th>
                        <th className="px-4 py-2 text-right font-semibold" title="KilosTotalUnit: precio negociado − flete, seguro y otros por kg">
                          Precio final/kg
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lines.map((l) => {
                        const share = isNum(tot.kilos) && tot.kilos > 0 && isNum(l.kilosTotal) ? (l.kilosTotal / tot.kilos) * 100 : 0;
                        return (
                          <tr key={l.codSecLineFilm} className="hover:bg-gray-50/60">
                            <td className="px-4 py-2">
                              <p className="font-medium text-gray-900">{l.tipoPelicula}</p>
                              {l.descripcion && <p className="text-[10px] text-gray-600 max-w-[260px] whitespace-normal">{l.descripcion}</p>}
                              <p className="text-[10px] text-gray-400">Línea {l.codSecLineFilm}</p>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {kg(l.kilosTotal)}
                              <div className="mt-1 h-1 w-16 ml-auto rounded-full bg-gray-100 overflow-hidden" title={`${share.toFixed(1)}% de los kilos`}>
                                <div className="h-full bg-[#F47735]/60" style={{ width: `${share}%` }} />
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{unit(l.precio)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{num2(l.valueTotal)}</td>
                            <Monto valor={l.valueFreight} porKg={l.valueFreightUnit} />
                            <Monto valor={l.valueSure} porKg={l.valueSureUnit} />
                            <Monto valor={l.expensesOther} porKg={l.expensesOtherUnit} />
                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">{num2(l.valueFOB)}</td>
                            <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-900">{unit(isNum(l.valueFOB) ? l.kilosTotalUnit : null)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {lines.length > 1 && (
                      <tfoot>
                        <tr className="bg-gray-50 font-semibold text-gray-900">
                          <td className="px-4 py-2">Total</td>
                          <td className="px-3 py-2 text-right tabular-nums">{kg(tot.kilos)}</td>
                          <td />
                          <td className="px-3 py-2 text-right tabular-nums">{num2(tot.valor)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{num2(tot.flete)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{num2(tot.seguro)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{num2(tot.otros)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{num2(tot.fob)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {liq.ajustes.filter(esAvisoDeFaltante).map((a) => (
                  <div key={a} className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 flex gap-2">
                    <Sparkles className="w-4 h-4 shrink-0 mt-px" />
                    <span>
                      <strong>Ajuste automático.</strong> {a}
                    </span>
                  </div>
                ))}

                {faltantes.visibles.length > 0 ? (
                  <Faltantes items={faltantes.visibles} />
                ) : (
                  <Listo>Liquidación completa: todos los valores calculados con datos reales de Oben.</Listo>
                )}
                <PendienteConfirmar items={liq.sinConfirmar} />
              </>
            )}
          </div>

          {liq && (
            <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap items-center gap-2 bg-gray-50/50 rounded-b-xl">
              {liq.aprobacion?.vigente ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">
                  <BadgeCheck className="w-4 h-4" /> Aprobada por COMEX{liq.aprobacion.por ? ` · ${liq.aprobacion.por}` : ''}
                </span>
              ) : puedeAprobar ? (
                <button className={btnSecondary} onClick={() => void aprobar()} disabled={aprobando || !liq.readyToSubmit || liq.simulated || liq.sinConfirmar.length > 0} title={liq.aprobacion?.existe ? 'Cambió algo desde la última aprobación: hay que aprobarla de nuevo' : 'COMEX aprueba estos valores antes de enviarlos a Oben'}>
                  {aprobando ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />}
                  {liq.aprobacion?.existe ? 'Aprobar de nuevo (COMEX)' : 'Aprobar liquidación (COMEX)'}
                </button>
              ) : null}
              {liq.readyToSubmit && !liq.aprobacion?.vigente && <span className="text-[11px] text-amber-700">Falta la aprobación de COMEX</span>}
              {liq.aprobacion?.vigente && (
                <span className="text-[11px] text-gray-500">Al aprobar sale el correo de revisión (proforma, lista de empaque y liquidación) y se pide la factura; Facturación recibe el aviso.</span>
              )}
              <button className={`${btnPrimary} ml-auto`} onClick={onContinuar}>
                Continuar al envío <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </Card>

        {liq && <VistaFacturaCard ov={factura.numberOrderSales} input={payload} version={`${tot.fob}-${tot.flete}-${tot.otros}-${liq.header.paNcm}-${liq.aprobacion?.vigente}`} />}
      </div>
    </div>
    {verProforma && <ProformaModal pf={pf} onClose={() => setVerProforma(false)} />}
    </div>
  );
}

/** De los ajustes automáticos solo se muestra lo que avisa de un dato faltante, provisional o vencido. */
function esAvisoDeFaltante(a: string): boolean {
  return /PROVISIONAL|venció|ya no está|no hay tarifa|digítala|Sin tipo|Sin partida|no se pudo|falta/i.test(a);
}

function Monto({ valor, porKg }: { valor?: number | null; porKg?: number | null }) {
  return (
    <td className="px-3 py-2 text-right tabular-nums">
      <span className={isNum(valor) ? 'text-gray-900' : 'text-gray-300'}>{num2(valor)}</span>
      {isNum(porKg) && isNum(valor) && valor !== 0 && <span className="block text-[10px] text-gray-400">{unit(porKg)}/kg</span>}
    </td>
  );
}
