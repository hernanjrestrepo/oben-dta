'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import type {
  ConceptoLiquidacion,
  FacturacionDraft,
  IncotermRegla,
  LiquidacionDraft,
  LiquidacionHeaderValues,
  LiquidacionSimulacion,
  OrigenValor,
} from '@/types';
import { AlertCircle, ArrowRight, Calculator, Check, FlaskConical, Loader2, Lock, Ship, Sparkles, X } from 'lucide-react';
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
}

const CONCEPTOS: ConceptoLiquidacion[] = ['flete', 'seguro', 'otrosGastos'];
const CONCEPTO_LABEL: Record<ConceptoLiquidacion, string> = { flete: 'Flete', seguro: 'Seguro', otrosGastos: 'Otros' };

const ORIGEN: Record<OrigenValor, { label: string; cls: string }> = {
  oben: { label: 'ERP Oben', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  maestro: { label: 'Maestro de tarifas', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  calculado: { label: 'Calculado', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  usuario: { label: 'Digitado', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
};

function OrigenBadge({ origen }: { origen?: OrigenValor }) {
  if (!origen) return null;
  const o = ORIGEN[origen];
  return <span className={`ml-1.5 inline-block px-1.5 py-px rounded border text-[10px] font-medium ${o.cls}`}>{o.label}</span>;
}

function descripcion(regla: IncotermRegla | undefined): string {
  if (!regla) return 'Escoge el Incoterm de la proforma: define qué valores se liquidan.';
  if (regla.conceptos.length === 0) return `${regla.codigo}: no se pide flete, seguro ni otros gastos — la mercancía se liquida tal cual.`;
  if (regla.conceptos.length === 1 && regla.conceptos[0] === 'flete') return `${regla.codigo}: solo se pide el flete (confirmado por José el 30-sep).`;
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
const MONTOS_USA: Array<[MontoKey, string]> = [
  ['inlandFreight', 'Inland Freight'],
  ['entryFee', 'Entry Fee'],
  ['importerSecurityFiling', 'Importer Security Filing'],
  ['harborMaintenanceFee', 'Harbor Maintenance Fee'],
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
  const [flete, setFlete] = useState('');
  const [otros, setOtros] = useState('');
  const [poliza, setPoliza] = useState('');
  // Solo lo que el usuario editó: lo demás lo resuelve el backend (ERP, maestro, cálculo) y se muestra con su origen.
  const [textos, setTextos] = useState<Partial<Record<TextoKey, string>>>({});
  const [montos, setMontos] = useState<Partial<Record<MontoKey, string>>>({});

  const [liq, setLiq] = useState<LiquidacionDraft | null>(null);
  const [calculando, setCalculando] = useState(true);
  const [error, setError] = useState('');
  const [sim, setSim] = useState<LiquidacionSimulacion | null>(null);
  const [simulando, setSimulando] = useState(false);
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
      totales: { incoterm, flete: parseNum(flete), otrosGastos: parseNum(otros), valorPoliza: parseNum(poliza) },
    };
  }, [textos, montos, incoterm, flete, otros, poliza]);

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
          setSim(null);
          onEstadoRef.current({ calculada: true, faltan: agruparFaltantes(d.missing).visibles.length, pendientes: d.sinConfirmar.length, incoterm: d.incoterm });
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

  async function simular() {
    if (!pf) return;
    try {
      setSimulando(true);
      setError('');
      setSim(await api.simulateLiquidacion(pf, payload));
    } catch (err) {
      setError(extractMessage(err, 'No se pudo simular el envío.'));
    } finally {
      setSimulando(false);
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

  const regla = reglas?.find((r) => r.codigo === incoterm);
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
  const textoValor = (k: TextoKey) => textos[k] ?? String(liq?.header[k] ?? '');
  const montoValor = (k: MontoKey) => montos[k] ?? (isNum(liq?.header[k]) ? String(liq!.header[k]) : '');
  const origen = (k: keyof LiquidacionHeaderValues) => (textos[k as TextoKey] !== undefined || montos[k as MontoKey] !== undefined ? 'usuario' : liq?.headerOrigen[k]);
  const faltantes = agruparFaltantes(liq?.missing ?? []);
  const bloqueos = [
    ...(faltantes.visibles.length ? [`Faltan ${faltantes.visibles.length} datos`] : []),
    ...(liq?.sinConfirmar.length ? ['Pendiente de validar con Oben'] : []),
    ...(liq?.simulated ? ['Datos del envío simulados'] : []),
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      {/* ── Datos ── */}
      <div className="xl:col-span-5 space-y-5">
        <Card>
          <CardHeader
            icon={<Ship className="w-4 h-4 text-[#F47735]" />}
            title="1 · Incoterm de la proforma"
            subtitle="Define qué se liquida. Tabla confirmada por José (30-sep)."
          />
          <div className="p-4">
            {!reglas ? (
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {reglas.map((r) => {
                  const sel = incoterm === r.codigo;
                  return (
                    <button
                      key={r.codigo}
                      onClick={() => setIncoterm(sel ? null : r.codigo)}
                      className={`text-left rounded-lg border p-2.5 transition ${
                        sel ? 'border-[#F47735] bg-orange-50 ring-2 ring-[#F47735]/25' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold tracking-wider text-gray-900">{r.codigo}</span>
                        {sel && <Check className="w-4 h-4 text-[#F47735]" />}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {CONCEPTOS.map((c) => (
                          <span
                            key={c}
                            className={`px-1.5 py-px rounded text-[10px] font-medium ${
                              r.conceptos.includes(c) ? 'bg-[#F47735]/10 text-[#C4521A]' : 'bg-gray-100 text-gray-400 line-through'
                            }`}
                          >
                            {CONCEPTO_LABEL[c]}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-3 text-xs text-gray-600">{descripcion(regla)}</p>
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={<Calculator className="w-4 h-4 text-[#F47735]" />}
            title="2 · Valores del envío"
            subtitle="Se digitan una vez para todo el envío y se reparten por kilos entre las líneas."
          />
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Flete total (USD)" hint={regla && !pide('flete') ? `No aplica en ${regla.codigo}` : undefined}>
              <input value={flete} onChange={(e) => setFlete(e.target.value)} disabled={!!regla && !pide('flete')} inputMode="decimal" placeholder="0,00" className={`${inputCls} w-full disabled:bg-gray-50 disabled:text-gray-400`} />
            </Field>
            <Field
              label={liq?.esUSA ? 'Otros costos destino (USD)' : 'Otros gastos (USD)'}
              hint={
                regla && !pide('otrosGastos')
                  ? `No aplica en ${regla.codigo}`
                  : liq?.esUSA
                    ? 'Debe cuadrar con Destination Charges; si no, se reemplaza (José).'
                    : undefined
              }
            >
              <input value={otros} onChange={(e) => setOtros(e.target.value)} disabled={!!regla && !pide('otrosGastos')} inputMode="decimal" placeholder="0,00" className={`${inputCls} w-full disabled:bg-gray-50 disabled:text-gray-400`} />
            </Field>
            <Field
              label="Valor de la póliza"
              className="sm:col-span-2"
              hint={regla && !pide('seguro') ? `No aplica en ${regla.codigo}` : 'Divisor global del seguro: FOB inicial = Subtotal ÷ póliza. Vigente según José; puede variar en el año.'}
            >
              <input
                value={poliza}
                onChange={(e) => setPoliza(e.target.value)}
                disabled={!!regla && !pide('seguro')}
                inputMode="decimal"
                placeholder={isNum(liq?.totales.valorPoliza) ? `${liq!.totales.valorPoliza} (vigente)` : '1,00053'}
                className={`${inputCls} w-full disabled:bg-gray-50 disabled:text-gray-400`}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="3 · Encabezado" subtitle="Dirección y puertos vienen del ERP de Oben; se pueden modificar." />
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
            <Field label="Notas (opcional)" className="sm:col-span-2">
              <input value={textoValor('notes')} onChange={(e) => setTextos((t) => ({ ...t, notes: e.target.value }))} className={`${inputCls} w-full`} />
            </Field>
          </div>
          {liq?.esUSA && (
            <div className="px-4 pb-4">
              <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-3">
                <p className="text-xs font-semibold text-sky-900 mb-2">Cargos de destino (USA)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {MONTOS_USA.map(([k, label]) => (
                    <Field
                      key={k}
                      label={
                        <>
                          {label} <OrigenBadge origen={origen(k)} />
                        </>
                      }
                      hint={k === 'harborMaintenanceFee' ? '0.125% del FOB final (José)' : undefined}
                    >
                      <input value={montoValor(k)} onChange={(e) => setMontos((m) => ({ ...m, [k]: e.target.value }))} inputMode="decimal" className={`${inputCls} w-full`} placeholder="USD" />
                    </Field>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between rounded-md bg-white border border-sky-200 px-3 py-2">
                  <span className="text-xs text-gray-600">
                    Destination Charges <OrigenBadge origen="calculado" />
                    <span className="block text-[11px] text-gray-400">Inland + Entry + ISF + HMF</span>
                  </span>
                  <span className="font-semibold tabular-nums text-gray-900">{usd(liq.header.destinationCharges)}</span>
                </div>
              </div>
            </div>
          )}
        </Card>
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
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <Kpi label="Valor mercancía" value={usd(tot.valor)} />
                  <Kpi label="Flete" value={usd(tot.flete)} tone={isNum(tot.flete) ? 'default' : 'muted'} />
                  <Kpi label="Seguro" value={usd(tot.seguro)} tone={isNum(tot.seguro) ? 'default' : 'muted'} />
                  <Kpi label="Otros gastos" value={usd(tot.otros)} tone={isNum(tot.otros) ? 'default' : 'muted'} />
                  <Kpi label="FOB final" value={usd(tot.fob)} tone={isNum(tot.fob) ? 'brand' : 'muted'} />
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
                <p className="text-[11px] text-gray-400">
                  Montos en USD. Unitarios por kg con 4 decimales truncados. Total y TotalUnidad se envían en 0 (José). Valor de la póliza aplicado:{' '}
                  {isNum(liq.totales.valorPoliza) ? liq.totales.valorPoliza : '—'}.
                </p>

                {liq.ajustes.map((a) => (
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
              <button className={btnSecondary} onClick={() => void simular()} disabled={simulando || !liq.readyToSubmit}>
                {simulando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
                Simular envío a Oben
              </button>
              <button className={`${btnSecondary} cursor-not-allowed`} disabled title={bloqueos.join(' · ') || 'Se habilita al validar con Oben'}>
                <Lock className="w-4 h-4" /> Enviar al ERP de Oben
              </button>
              <span className="text-[11px] text-gray-500">{bloqueos.length ? bloqueos.join(' · ') : 'Envío real pendiente de validación con Oben'}</span>
              <button className={`${btnPrimary} ml-auto`} onClick={onContinuar}>
                Continuar al documento <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </Card>

        {sim?.payloads && (
          <Card className="border-emerald-200">
            <CardHeader
              icon={<FlaskConical className="w-4 h-4 text-emerald-600" />}
              title="Simulación del envío al ERP de Oben"
              subtitle={`Se crearía 1 encabezado (spSettlement_Head) y ${sim.payloads.details.length} detalle${sim.payloads.details.length === 1 ? '' : 's'} (spSettlement_Detail). No se escribió nada.`}
              right={
                <button onClick={() => setSim(null)} className="p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-gray-50 text-gray-500">
                    {['CodSecLineFilm', 'KilosTotal', 'KilosTotalUnit', 'ValueTotal', 'ValueFreight', 'SubTotal', 'ValueSure', 'ExpensesOther', 'ValueFOB', 'Total', 'TotalUnidad'].map((h) => (
                      <th key={h} className="px-3 py-2 text-right font-mono font-medium first:text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-mono">
                  {sim.payloads.details.map((d) => (
                    <tr key={String(d.codSecLineFilm)}>
                      {['codSecLineFilm', 'kilosTotal', 'kilosTotalUnit', 'valueTotal', 'valueFreight', 'subTotal', 'valueSure', 'expensesOther', 'valueFOB', 'total', 'totalUnidad'].map((k) => (
                        <td key={k} className="px-3 py-1.5 text-right first:text-left tabular-nums text-gray-700">
                          {String(d[k] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function Monto({ valor, porKg }: { valor?: number | null; porKg?: number | null }) {
  return (
    <td className="px-3 py-2 text-right tabular-nums">
      <span className={isNum(valor) ? 'text-gray-900' : 'text-gray-300'}>{num2(valor)}</span>
      {isNum(porKg) && isNum(valor) && valor !== 0 && <span className="block text-[10px] text-gray-400">{unit(porKg)}/kg</span>}
    </td>
  );
}
