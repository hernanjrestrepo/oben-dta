'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { FlowResult } from '@/types';
import {
  Bot,
  Sparkles,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  Brain,
  CreditCard,
  Package,
  Receipt,
  Workflow,
  Activity,
  Boxes,
  Ship,
  Building2,
  Network,
  Radio,
  ShieldCheck,
  Factory,
  Truck,
  Mail,
  ArrowRight,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Integraciones del ecosistema Oben (representación de arquitectura segun el
// Blueprint DTA y el inventario de APIs de Oben Group). La telemetria en vivo
// de cada sistema se habilita al cargar las credenciales de produccion; aqui
// se muestran como puntos de integracion definidos, no como sondeo en vivo.
// ---------------------------------------------------------------------------
type IntegrationState = 'conectado' | 'configurado' | 'planificado';

interface Integration {
  name: string;
  role: string;
  endpoints: number;
  icon: React.ElementType;
  state: IntegrationState;
}

const INTEGRATIONS: Integration[] = [
  { name: 'NetSuite', role: 'ERP · Inventario, Ensamblaje, Orden de Venta', endpoints: 10, icon: Boxes, state: 'configurado' },
  { name: 'VETA', role: 'Proveedores · Compras y Recepciones', endpoints: 7, icon: Building2, state: 'configurado' },
  { name: 'Armstrong', role: 'Producción · Corte, Pallets, Etiquetado', endpoints: 4, icon: Factory, state: 'configurado' },
  { name: 'Portal Proveedores', role: 'proveedores.obengroup.co', endpoints: 1, icon: Network, state: 'conectado' },
  { name: 'Intranet', role: 'obengroup.co · Colaboradores', endpoints: 1, icon: Radio, state: 'conectado' },
  { name: 'Oben+', role: 'Core comercial y operativo', endpoints: 0, icon: Activity, state: 'conectado' },
  { name: 'DIAN · E-Franco', role: 'Facturación electrónica', endpoints: 0, icon: ShieldCheck, state: 'configurado' },
  { name: 'Cube IQ', role: 'Cubicaje y balanceo de carga', endpoints: 0, icon: Package, state: 'planificado' },
  { name: 'Navieras', role: 'Cotizador inteligente de flete', endpoints: 0, icon: Ship, state: 'planificado' },
];

// Flujos de automatización definidos en el Blueprint DTA (order-to-cash + export)
const PIPELINE = [
  { label: 'Recepción Omnicanal', system: 'Email · WhatsApp · Teléfono', icon: Mail },
  { label: 'Interpretación IA', system: 'EVA', icon: Brain },
  { label: 'Cotización & Cubicaje', system: 'Cube IQ · Balanceo', icon: Package },
  { label: 'Aprobación', system: 'Cliente · Cartera', icon: CheckCircle2 },
  { label: 'Facturación & Despacho', system: 'Oben+ · Lista de empaque', icon: Receipt },
  { label: 'Exportación', system: 'Liquidación · Incoterm', icon: Ship },
  { label: 'DIAN', system: 'Factura electrónica', icon: ShieldCheck },
  { label: 'Tracking Logístico', system: 'Navieras', icon: Truck },
];

const EXAMPLES = ['quiero 10 SKU-001', 'quiero 80 SKU-002', 'necesito 5 SKU-001'];

const stateStyles: Record<IntegrationState, { dot: string; text: string; label: string }> = {
  conectado: { dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'Conectado' },
  configurado: { dot: 'bg-sky-400', text: 'text-sky-300', label: 'Configurado' },
  planificado: { dot: 'bg-slate-500', text: 'text-slate-400', label: 'En roadmap' },
};

function money(n: number) {
  return `$${Number(n).toLocaleString('es-CO')}`;
}

export default function OperacionesPage() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FlowResult | null>(null);
  const [error, setError] = useState('');
  const [processed, setProcessed] = useState(0);
  const [realOrders, setRealOrders] = useState<number | null>(null);

  useEffect(() => {
    api
      .getOrders()
      .then((o) => setRealOrders(o.length))
      .catch(() => setRealOrders(null));
  }, []);

  async function runEva(text: string) {
    const cmd = text.trim();
    if (!cmd) return;
    try {
      setLoading(true);
      setError('');
      const data = await api.processFlow(cmd);
      setResult(data);
      if (data.order) setProcessed((p) => p + 1);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'EVA no pudo procesar la instrucción.');
    } finally {
      setLoading(false);
    }
  }

  const statusBadge = useMemo(() => {
    if (!result) return null;
    const map = {
      CONFIRMED: { text: 'Confirmado y facturado', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
      PENDING_PRODUCTION: { text: 'Enviado a producción', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
      BLOCKED: { text: 'Bloqueado', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
    } as const;
    return map[result.status];
  }, [result]);

  return (
    <div className="space-y-8 text-slate-100">
      {/* ---------------- Header ---------------- */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-sky-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Bot className="w-8 h-8 text-slate-950" />
            </div>
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-[#0b1220] animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Centro de Operaciones IA</h1>
            <p className="text-slate-400 text-sm">
              DTA Oben · Plataforma de automatización empresarial con IA
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            EVA en línea
          </span>
        </div>
      </header>

      {/* ---------------- KPIs operativos ---------------- */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Workflow} label="Flujos automatizados" value="8" hint="Order-to-cash + export" />
        <KpiCard icon={Network} label="Integraciones" value="9" hint="Ecosistema Oben" accent="sky" />
        <KpiCard icon={Sparkles} label="Procesado por EVA" value={String(processed)} hint="En esta sesión" accent="emerald" />
        <KpiCard
          icon={Activity}
          label="Órdenes en sistema"
          value={realOrders === null ? '—' : String(realOrders)}
          hint="Dato en vivo"
          accent="violet"
        />
      </section>

      {/* ================= EVA — consola en vivo ================= */}
      <section className="rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/80 to-slate-900/40 overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-700/60 px-6 py-4">
          <Brain className="w-5 h-5 text-emerald-400" />
          <div>
            <h2 className="font-semibold">EVA · Orquestación autónoma de pedidos</h2>
            <p className="text-xs text-slate-400">
              Escribe una instrucción en lenguaje natural. EVA interpreta, valida crédito e inventario,
              decide y factura — en tiempo real.
            </p>
          </div>
          <span className="ml-auto hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 text-xs text-emerald-300">
            <Sparkles className="w-3.5 h-3.5" /> Motor en vivo
          </span>
        </div>

        <div className="p-6 space-y-5">
          {/* Input */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400/70" />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runEva(input)}
                placeholder='Ej: "quiero 10 SKU-001"'
                className="w-full rounded-xl bg-slate-950/70 border border-slate-700 pl-10 pr-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 transition"
              />
            </div>
            <button
              onClick={() => runEva(input)}
              disabled={loading || !input.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Ejecutar
            </button>
          </div>

          {/* Example chips */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-slate-500 py-1">Prueba:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  setInput(ex);
                  runEva(ex);
                }}
                className="rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-xs text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300 transition"
              >
                {ex}
              </button>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <XCircle className="w-4 h-4" /> {error}
            </div>
          )}

          {/* Pipeline de resultado */}
          {result && (
            <div className="space-y-3 pt-2">
              <Stage
                icon={Brain}
                title="1 · Interpretación IA"
                ok={result.parsed.items.length > 0}
              >
                {result.parsed.items.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-slate-300">
                      Cliente <span className="text-slate-100 font-medium">{result.parsed.clientId}</span>
                    </p>
                    {result.parsed.items.map((it) => (
                      <p key={it.sku} className="text-slate-300">
                        {it.qty} × <span className="text-slate-100 font-medium">{it.name}</span> ({it.sku}) ·{' '}
                        {money(it.total)} COP
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400">No se pudo interpretar la instrucción.</p>
                )}
              </Stage>

              <Stage
                icon={CreditCard}
                title="2 · Validación de Crédito"
                ok={result.creditCheck.passed}
              >
                <p className="text-slate-300">
                  Cupo disponible {money(result.creditCheck.available)} · pedido{' '}
                  {money(result.creditCheck.orderTotal)} COP
                </p>
              </Stage>

              <Stage
                icon={Package}
                title="3 · Validación de Inventario"
                ok={result.inventoryCheck.passed}
              >
                <p className="text-slate-300">
                  Solicitado {result.inventoryCheck.requested} · disponible{' '}
                  {result.inventoryCheck.available} unidades
                </p>
              </Stage>

              <Stage icon={Workflow} title="4 · Decisión autónoma" ok={result.status !== 'BLOCKED'}>
                <div className="space-y-2">
                  <p className="text-slate-300">{result.decision}</p>
                  {statusBadge && (
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${statusBadge.cls}`}>
                      {statusBadge.text}
                    </span>
                  )}
                </div>
              </Stage>

              {(result.order || result.invoice) && (
                <Stage icon={Receipt} title="5 · Orden & Facturación DIAN" ok={!!result.order}>
                  <div className="flex flex-wrap gap-3">
                    {result.order && (
                      <span className="rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-1.5 text-xs">
                        Orden <span className="text-emerald-300 font-medium">{result.order.orderId}</span>
                      </span>
                    )}
                    {result.invoice && (
                      <>
                        <span className="rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-1.5 text-xs">
                          Factura <span className="text-emerald-300 font-medium">{result.invoice.invoiceId}</span>
                        </span>
                        <span className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-300">
                          DIAN: {result.invoice.dianStatus}
                        </span>
                      </>
                    )}
                  </div>
                </Stage>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ================= Pipeline de automatización (Blueprint) ================= */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Workflow className="w-5 h-5 text-sky-400" />
          <h2 className="font-semibold">Flujos de automatización · Blueprint DTA</h2>
        </div>
        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-5">
          <div className="flex gap-3 overflow-x-auto pb-2">
            {PIPELINE.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.label} className="flex items-center gap-3 shrink-0">
                  <div className="w-44 rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-7 h-7 rounded-lg bg-sky-500/15 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-sky-300" />
                      </div>
                      <span className="text-xs font-semibold text-slate-200">{step.label}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-tight">{step.system}</p>
                  </div>
                  {i < PIPELINE.length - 1 && (
                    <ArrowRight className="w-4 h-4 text-slate-600 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================= Integraciones Oben ================= */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Network className="w-5 h-5 text-emerald-400" />
          <h2 className="font-semibold">Integraciones del ecosistema Oben</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {INTEGRATIONS.map((it) => {
            const Icon = it.icon;
            const s = stateStyles[it.state];
            return (
              <div
                key={it.name}
                className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4 hover:border-slate-600 transition"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-slate-200" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-100 text-sm">{it.name}</p>
                      <p className="text-xs text-slate-400">{it.role}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className={`inline-flex items-center gap-1.5 ${s.text}`}>
                    <span className={`w-2 h-2 rounded-full ${s.dot}`} /> {s.label}
                  </span>
                  {it.endpoints > 0 && (
                    <span className="text-slate-500">{it.endpoints} endpoints</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-slate-500 leading-relaxed">
          Arquitectura de integración según el Blueprint DTA y el inventario de APIs de Oben Group.
          La telemetría en vivo de cada sistema se activa al cargar las credenciales de producción de
          NetSuite, VETA y Armstrong.
        </p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  accent = 'slate',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint: string;
  accent?: 'slate' | 'emerald' | 'sky' | 'violet';
}) {
  const accents: Record<string, string> = {
    slate: 'text-slate-300 bg-slate-700/40',
    emerald: 'text-emerald-300 bg-emerald-500/15',
    sky: 'text-sky-300 bg-sky-500/15',
    violet: 'text-violet-300 bg-violet-500/15',
  };
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accents[accent]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-50">{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>
    </div>
  );
}

function Stage({
  icon: Icon,
  title,
  ok,
  children,
}: {
  icon: React.ElementType;
  title: string;
  ok: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-slate-700/60 bg-slate-950/40 p-4">
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
          ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'
        }`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
          {ok ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <XCircle className="w-4 h-4 text-red-400" />
          )}
        </div>
        <div className="mt-1 text-xs leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
