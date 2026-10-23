'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import type { FacturacionDraft, FacturacionHistorial, FacturacionInput, ProformaOrdenes, ProformaPendienteComex } from '@/types';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Globe2,
  Loader2,
  MapPin,
  Receipt,
  RefreshCw,
  Search,
  Send,
  Ship,
  ShieldCheck,
  TriangleAlert,
  X,
} from 'lucide-react';
import { LiquidacionPanel, type LiquidacionEstado } from './LiquidacionPanel';
import { TIPO_LABEL } from './DocumentoPanel';
import { EnvioPanel } from './EnvioPanel';
import { Card, SimuladoBadge, btnSecondary, fecha, usd } from './ui';

type Paso = 'liquidacion' | 'envio';
type Tono = 'ok' | 'warn' | 'info' | 'idle' | 'na';

const TONO: Record<Tono, string> = {
  ok: 'text-emerald-700',
  warn: 'text-amber-700',
  info: 'text-indigo-700',
  idle: 'text-gray-500',
  na: 'text-gray-400',
};

/**
 * Liquidación y Facturación de Oben, de punta a punta: 1) Liquidación de
 * comercio exterior (fórmula de José), 2) Documento de facturación, 3) Envío
 * a Facturación/COMEX. Se busca por PROFORMA (Comex trabaja por PF; una PF
 * puede traer varias OV, reunión del 15-oct); los enlaces viejos por OV
 * (/facturacion?ov=11147) siguen funcionando. Todo en vivo contra el ERP de
 * Oben; lo simulado se rotula siempre.
 */
export default function FacturacionPage() {
  const [pfInput, setPfInput] = useState('');
  const [proforma, setProforma] = useState<ProformaOrdenes | null>(null);
  const [draft, setDraft] = useState<FacturacionDraft | null>(null);
  const [historial, setHistorial] = useState<FacturacionHistorial | null>(null);
  const [input, setInput] = useState<FacturacionInput>({});
  const [loading, setLoading] = useState(false);
  const [, setActualizando] = useState(false);
  const [error, setError] = useState('');
  const [paso, setPaso] = useState<Paso>('liquidacion');
  // Proformas de exportación pendientes de aprobación de COMEX (Hernán, 16-oct): reemplazan las "órdenes recientes".
  const [pendientes, setPendientes] = useState<ProformaPendienteComex[] | null>(null);
  const [liqEstado, setLiqEstado] = useState<LiquidacionEstado | null>(null);
  const reqId = useRef(0);
  const primeraCarga = useRef(true);
  const pasosRef = useRef<HTMLElement>(null);

  /** Cambia de paso y lleva la vista a la barra de pasos (el panel nuevo empieza arriba). */
  function irA(p: Paso) {
    setPaso(p);
    const top = (pasosRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY - 16;
    if (top < window.scrollY) window.scrollTo({ top, behavior: 'smooth' });
  }

  /** Carga una OV. `pf` = la proforma por la que se llegó (sin ella, se toma la de la OV). */
  const cargar = useCallback(async (n: number, pf: ProformaOrdenes | null = null) => {
    const id = ++reqId.current;
    setLoading(true);
    setError('');
    setDraft(null);
    setHistorial(null);
    setInput({});
    setLiqEstado(null);
    setProforma(pf);
    setPfInput(pf ? pf.numberPF : '');
    primeraCarga.current = true;
    try {
      window.history.replaceState(null, '', pf ? `/facturacion?pf=${pf.numberPF}&ov=${n}` : `/facturacion?ov=${n}`);
      const [d, h] = await Promise.all([api.getFacturacionDraft(n), api.getFacturacionHistorial(n)]);
      if (id !== reqId.current) return;
      setDraft(d);
      setHistorial(h);
      if (!pf && d.proforma) setPfInput(d.proforma);
      setPaso(d.kind === 'exportacion' ? 'liquidacion' : 'envio');
    } catch (err) {
      if (id === reqId.current) setError(extractMessage(err, `No se pudo consultar la orden de venta ${n} en el ERP de Oben.`));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  /** Busca la proforma en Oben y carga su (primera) orden de venta. */
  const cargarProforma = useCallback(
    async (pf: string, ov?: number) => {
      const id = ++reqId.current;
      setLoading(true);
      setError('');
      setDraft(null);
      setProforma(null);
      setPfInput(pf);
      try {
        const p = await api.getProformaOrdenes(pf);
        if (id !== reqId.current) return;
        void cargar(ov && p.ordenesVenta.includes(ov) ? ov : p.ordenesVenta[0], p);
      } catch (err) {
        if (id === reqId.current) {
          setError(extractMessage(err, `No se pudo consultar la proforma ${pf} en el ERP de Oben.`));
          setLoading(false);
        }
      }
    },
    [cargar],
  );

  useEffect(() => {
    api
      .getProformasPendientes()
      .then(setPendientes)
      .catch(() => setPendientes([]));
    // Enlace directo (/facturacion?pf=11208, o el viejo /facturacion?ov=11147): se carga fuera del render del efecto.
    const params = new URLSearchParams(window.location.search);
    const pf = (params.get('pf') ?? '').trim();
    const ov = Number(params.get('ov'));
    const t = /^\d+$/.test(pf)
      ? setTimeout(() => void cargarProforma(pf, Number.isInteger(ov) && ov > 0 ? ov : undefined), 0)
      : Number.isInteger(ov) && ov > 0
        ? setTimeout(() => void cargar(ov), 0)
        : null;
    return () => {
      if (t) clearTimeout(t);
    };
  }, [cargar, cargarProforma]);

  // Lo que se digita en el documento se re-valida contra el backend (qué falta, de dónde sale la dirección).
  const ov = draft?.numberOrderSales ?? null;
  useEffect(() => {
    if (ov === null) return;
    if (primeraCarga.current) {
      primeraCarga.current = false;
      return;
    }
    const id = reqId.current;
    const t = setTimeout(() => {
      setActualizando(true);
      api
        .getFacturacionDraft(ov, input)
        .then((d) => {
          if (id === reqId.current) setDraft(d);
        })
        .catch(() => {
          /* se conserva el borrador anterior; el envío vuelve a validar todo */
        })
        .finally(() => setActualizando(false));
    }, 600);
    return () => clearTimeout(t);
  }, [ov, input]);

  /** COMEX ya la liquidó por fuera (20-oct, p. ej. la 11166): sale de las pendientes. Se puede seguir abriendo por número. */
  async function descartar(p: ProformaPendienteComex) {
    const motivo = window.prompt(`¿Quitar la PF ${p.numberPF}${p.cliente ? ` (${p.cliente})` : ''} de las pendientes porque COMEX ya la liquidó por fuera?\n\nMotivo (opcional):`, 'Ya liquidada en OBEN MAS');
    if (motivo === null) return;
    try {
      await api.descartarPendienteComex(p.numberPF, motivo || null);
      setPendientes((lista) => (lista ?? []).filter((x) => x.numberPF !== p.numberPF));
    } catch (err) {
      setError(extractMessage(err, `No se pudo quitar la PF ${p.numberPF} de las pendientes.`));
    }
  }

  function buscar() {
    const pf = pfInput.trim();
    if (!/^\d+$/.test(pf) || Number(pf) <= 0) {
      setError('Escribe un número de proforma válido (ej: 11208).');
      return;
    }
    void cargarProforma(pf);
  }

  async function refrescarHistorial() {
    if (ov === null) return;
    try {
      setHistorial(await api.getFacturacionHistorial(ov));
    } catch {
      /* el envío ya se mostró como exitoso */
    }
  }

  const exportacion = draft?.kind === 'exportacion';
  const envioOk = historial?.envios.find((e) => e.ok) ?? null;
  const pasos: Array<{ key: Paso; n: number; titulo: string; icon: typeof Ship; estado: string; tono: Tono }> = draft
    ? [
        {
          key: 'liquidacion',
          n: 1,
          titulo: 'Liquidación',
          icon: Ship,
          ...(!exportacion
            ? { estado: 'No aplica · pedido nacional', tono: 'na' as Tono }
            : !liqEstado
              ? { estado: 'Calculando con Oben…', tono: 'idle' as Tono }
              : liqEstado.faltan > 0
                ? { estado: `Faltan ${liqEstado.faltan} dato${liqEstado.faltan === 1 ? '' : 's'}`, tono: 'warn' as Tono }
                : liqEstado.pendientes > 0
                  ? { estado: 'Calculada · envío a Oben por validar', tono: 'info' as Tono }
                  : { estado: 'Lista', tono: 'ok' as Tono }),
        },
        {
          key: 'envio',
          n: 2,
          titulo: 'Envío a Facturación',
          icon: Send,
          ...(envioOk ? { estado: `Enviado ${fecha(envioOk.fecha)}`, tono: 'ok' as Tono } : { estado: 'Pendiente', tono: 'idle' as Tono }),
        },
      ]
    : [];

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Receipt className="w-6 h-6 text-[#F47735]" />
            Liquidación y Facturación
          </h1>
          <p className="text-gray-500 mt-1">De la proforma al documento de facturación, con los datos reales del ERP de Oben. Lo simulado se marca siempre.</p>
        </div>
        {draft && (
          <button
            className={btnSecondary}
            onClick={() => void (proforma ? cargarProforma(proforma.numberPF, draft.numberOrderSales) : cargar(draft.numberOrderSales))}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar desde Oben
          </button>
        )}
      </div>

      {/* Buscador */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={pfInput}
              onChange={(e) => setPfInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscar()}
              inputMode="numeric"
              placeholder="Número de proforma de Oben (ej: 11208)"
              aria-label="Número de proforma"
              className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F47735] focus:border-[#F47735] outline-none text-gray-900"
            />
          </div>
          <button
            onClick={buscar}
            disabled={loading || !pfInput.trim()}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg font-medium transition disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Cargar proforma
          </button>
        </div>
        {proforma && proforma.ordenesVenta.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-gray-500">
              La proforma {proforma.numberPF} tiene {proforma.ordenesVenta.length} órdenes de venta:
            </span>
            {proforma.ordenesVenta.map((n) => (
              <button
                key={n}
                onClick={() => void cargar(n, proforma)}
                disabled={loading}
                className={`px-2.5 py-1 rounded-full border transition ${
                  draft?.numberOrderSales === n ? 'border-[#F47735] bg-orange-50 text-[#C4521A] font-semibold' : 'border-gray-200 bg-white text-gray-700 hover:border-[#F47735]/50'
                }`}
              >
                OV {n}
              </button>
            ))}
          </div>
        )}
        {pendientes && pendientes.length > 0 && (
          <div className="mt-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1.5 flex items-center gap-1">
              <ClipboardList className="w-3 h-3" /> Proformas pendientes de aprobación de COMEX ({pendientes.length})
            </p>
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
              {pendientes.map((p) => {
                const activa = proforma?.numberPF === p.numberPF || draft?.proforma === p.numberPF;
                return (
                  <span
                    key={p.numberPF}
                    className={`group inline-flex items-center rounded-full border text-xs transition ${
                      activa ? 'border-[#F47735] bg-orange-50 text-[#C4521A]' : 'border-gray-200 bg-white text-gray-700 hover:border-[#F47735]/50 hover:bg-orange-50/50'
                    }`}
                  >
                    <button
                      onClick={() => void cargarProforma(p.numberPF)}
                      disabled={loading}
                      className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1"
                      title={[p.cliente, p.pais, p.incoterm, p.ordenesVenta.length ? `OV ${p.ordenesVenta.join(', ')}` : null].filter(Boolean).join(' · ')}
                      aria-label={`Cargar PF ${p.numberPF}${p.cliente ? ` · ${p.cliente}` : ''}`}
                    >
                      <span className="font-semibold">PF {p.numberPF}</span>
                      {p.cliente && <span className="text-gray-500 max-w-[180px] truncate">{p.cliente}</span>}
                    </button>
                    <button
                      onClick={() => void descartar(p)}
                      className="pr-2 pl-0.5 py-1 text-gray-300 hover:text-red-600"
                      title="Ya la liquidó COMEX por fuera: quitarla de las pendientes"
                      aria-label={`Quitar la PF ${p.numberPF} de las pendientes`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {pendientes && pendientes.length === 0 && <p className="mt-3 text-[11px] text-gray-400">No hay proformas de exportación pendientes de aprobación de COMEX.</p>}
      </Card>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          <div className="h-28 rounded-xl bg-white border border-gray-200 animate-pulse" />
          <div className="h-20 rounded-xl bg-white border border-gray-200 animate-pulse" />
          <div className="h-80 rounded-xl bg-white border border-gray-200 animate-pulse" />
          <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Consultando la proforma en el ERP de Oben…
          </p>
        </div>
      )}

      {!draft && !loading && !error && <Bienvenida />}

      {draft && !loading && (
        <>
          {/* Resumen de la orden */}
          <Card className="p-5">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-gray-400">
                    {draft.proforma ? `PF ${draft.proforma} · ` : ''}OV {draft.numberOrderSales}
                  </span>
                  {draft.kind && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        draft.kind === 'exportacion' ? 'bg-blue-50 text-blue-700' : 'bg-teal-50 text-teal-700'
                      }`}
                    >
                      {draft.kind === 'exportacion' ? <Globe2 className="inline w-3 h-3 mr-1 -mt-0.5" /> : <MapPin className="inline w-3 h-3 mr-1 -mt-0.5" />}
                      {TIPO_LABEL[draft.kind]}
                    </span>
                  )}
                  {draft.simulated ? (
                    <SimuladoBadge items={draft.simulatedFields} />
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                      <ShieldCheck className="w-3 h-3" /> Datos reales del ERP de Oben
                    </span>
                  )}
                </div>
                <h2 className="mt-1 text-xl font-bold text-gray-900 truncate" title={draft.cliente}>{draft.cliente || 'Cliente sin nombre en Oben'}</h2>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600">
                  <Dato label="País" valor={draft.pais} />
                  <Dato label="Proforma" valor={draft.proforma} />
                  <Dato label="Orden de compra" valor={draft.ordenCompra} />
                  <Dato label="Contenedor" valor={draft.contenedor} />
                  <Dato label="Material" valor={draft.codigoMaterial} />
                  {exportacion && <Dato label="Término de pago" valor={liqEstado ? (liqEstado.terminoPago ?? 'Oben no lo trae') : null} />}
                </div>
              </div>
              <div className="flex gap-6 lg:pl-6 lg:border-l border-gray-100">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Kilos</p>
                  <p className="text-lg font-bold tabular-nums text-gray-900">{draft.totalKilos.toLocaleString('es-CO', { maximumFractionDigits: 2 })}</p>
                </div>
                {/* Exportación: sin "Valor" (Hernán, 23-oct: confunde); manda el total de la factura. */}
                {!exportacion && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">Valor</p>
                    <p className="text-lg font-bold tabular-nums text-[#C4521A]">{usd(draft.totalValor)}</p>
                  </div>
                )}
                {exportacion && liqEstado?.totalFactura != null && (
                  <div title="FOB final + flete + seguro + otros gastos: el total de la factura">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">Total {liqEstado.incoterm ?? 'factura'}</p>
                    <p className="text-lg font-bold tabular-nums text-emerald-700">{usd(liqEstado.totalFactura)}</p>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Pasos. Exportación: no hay más pasos en pantalla; al aprobar COMEX todo sigue solo (Hernán, 23-oct). */}
          <nav ref={pasosRef} className={`${exportacion ? 'hidden' : 'grid'} grid-cols-1 md:grid-cols-2 gap-3`}>
            {pasos.map((p) => {
              const activo = paso === p.key;
              const Icon = p.icon;
              return (
                <button
                  key={p.key}
                  onClick={() => setPaso(p.key)}
                  className={`relative text-left rounded-xl border p-4 transition flex items-center gap-3 ${
                    activo ? 'border-[#F47735] bg-white shadow-md ring-2 ring-[#F47735]/20' : 'border-gray-200 bg-white/70 hover:bg-white hover:shadow-sm'
                  }`}
                >
                  <span
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      p.tono === 'ok' ? 'bg-emerald-100 text-emerald-700' : activo ? 'bg-[#F47735] text-white' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {p.tono === 'ok' ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400">Paso {p.n}</span>
                    <span className="block font-semibold text-gray-900">{p.titulo}</span>
                    <span className={`block text-xs truncate ${TONO[p.tono]}`}>
                      {p.tono === 'warn' && <TriangleAlert className="inline w-3 h-3 mr-1 -mt-0.5" />}
                      {p.estado}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Paneles: se mantienen montados para no perder lo digitado al cambiar de paso */}
          <div className={paso === 'liquidacion' ? '' : 'hidden'}>
            {exportacion ? (
              <LiquidacionPanel factura={draft} onEstado={setLiqEstado} />
            ) : (
              <Card className="p-8 text-center">
                <MapPin className="w-8 h-8 text-teal-600 mx-auto" />
                <p className="mt-3 font-semibold text-gray-900">La liquidación de comercio exterior aplica a pedidos de exportación</p>
                <p className="text-sm text-gray-500 mt-1">Este pedido es {draft.kind ? TIPO_LABEL[draft.kind].toLowerCase() : 'sin clasificar'}: pasa directo al envío a Facturación.</p>
                <button className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg text-sm font-medium" onClick={() => irA('envio')}>
                  Ir al envío
                </button>
              </Card>
            )}
          </div>
          <div className={paso === 'envio' ? '' : 'hidden'}>
            <EnvioPanel draft={draft} input={input} historial={historial} onEnviado={() => void refrescarHistorial()} />
          </div>
        </>
      )}
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string | null }) {
  return (
    <span>
      <span className="text-gray-400">{label}:</span> <span className="font-medium text-gray-800">{valor ?? '—'}</span>
    </span>
  );
}

function Bienvenida() {
  const pasos = [
    { icon: Ship, titulo: 'Liquidación', texto: 'Incoterm, flete, seguro y otros gastos con la fórmula de Oben; FOB final por línea.' },
    { icon: Send, titulo: 'Envío', texto: 'A Facturación/COMEX con la factura electrónica, una sola vez por orden.' },
  ];
  return (
    <Card className="p-8">
      <div className="text-center max-w-2xl mx-auto">
        <p className="text-lg font-semibold text-gray-900">Carga una proforma para empezar</p>
        <p className="text-sm text-gray-500 mt-1">El sistema consulta la proforma y sus órdenes de venta en el ERP de Oben, la clasifica (exportación o nacional) y te guía en dos pasos.</p>
      </div>
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        {pasos.map((p, i) => (
          <div key={p.titulo} className="rounded-xl border border-gray-100 bg-gray-50/60 p-5">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-[#F47735] text-white flex items-center justify-center text-sm font-bold">{i + 1}</span>
              <p.icon className="w-5 h-5 text-[#F47735]" />
            </div>
            <p className="mt-3 font-semibold text-gray-900">{p.titulo}</p>
            <p className="text-sm text-gray-500 mt-1">{p.texto}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
