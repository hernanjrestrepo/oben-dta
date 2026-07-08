'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { EvaResult, AdanAnswer, AdanStats, IntegrationStatus } from '@/types';
import {
  Bot,
  Sparkles,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  Brain,
  Receipt,
  Workflow,
  Network,
  Building2,
  Factory,
  ShieldCheck,
  Package,
  Ship,
  Radio,
  BookOpen,
  FileText,
  ArrowRight,
} from 'lucide-react';

// Integraciones del ecosistema Oben — el estado se consulta EN VIVO al
// Integration Hub (GET /integrations/status). Cada sistema corre hoy sobre un
// simulador real y funcional (no una maqueta visual); la única pieza que falta
// para pasar a modo real es la credencial/URL de Oben, configurable por tenant
// sin tocar código (AdapterRegistry resuelve Real vs Mock automáticamente).
const INTEGRATION_META: Record<string, { label: string; role: string; icon: React.ElementType }> = {
  netsuite: { label: 'NetSuite', role: 'ERP · sistema de registro', icon: Building2 },
  veta: { label: 'VETA', role: 'Producción / producto', icon: Factory },
  armstrong: { label: 'Armstrong', role: 'Logística / despacho', icon: Ship },
  dian: { label: 'DIAN', role: 'Factura electrónica', icon: ShieldCheck },
  oracle: { label: 'Oracle', role: 'Financiero / contable', icon: Building2 },
  oben: { label: 'Oben ERP', role: 'Productos / inventario', icon: Package },
  cubeiq: { label: 'CubeIQ', role: 'Optimización de carga', icon: Workflow },
  efranco: { label: 'EFranco', role: 'Agente aduanero', icon: Ship },
  shipping: { label: 'Transporte', role: 'Naviera / courier', icon: Ship },
  email: { label: 'Email', role: 'Notificaciones', icon: Network },
  whatsapp: { label: 'WhatsApp', role: 'Mensajería cliente', icon: Radio },
};
const stateStyles: Record<IntegrationStatus['state'], { dot: string; text: string; label: string }> = {
  operational: { dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'Simulador activo' },
  pending_credentials: { dot: 'bg-amber-400', text: 'text-amber-300', label: 'Pendiente de integración externa' },
  unreachable: { dot: 'bg-red-400', text: 'text-red-300', label: 'No alcanzable' },
  error: { dot: 'bg-red-400', text: 'text-red-300', label: 'Error' },
  disabled: { dot: 'bg-slate-500', text: 'text-slate-400', label: 'Deshabilitado' },
};

const EVA_EXAMPLES = ['Quiero 10 SKU-001 para ACME', 'Quiero 5 SKU-001 para ZETA'];
const ADAN_EXAMPLES = ['¿Cuál es el procedimiento para exportar a Perú?', '¿Qué Incoterm se usa para Perú?'];

function money(n: number | null | undefined) {
  return `$${Number(n || 0).toLocaleString('es-CO')}`;
}

export default function OperacionesPage() {
  // KPIs reales
  const [orders, setOrders] = useState<number | null>(null);
  const [invoices, setInvoices] = useState<number | null>(null);
  const [adanStats, setAdanStats] = useState<AdanStats | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);

  // EVA
  const [evaInput, setEvaInput] = useState('');
  const [evaLoading, setEvaLoading] = useState(false);
  const [evaResult, setEvaResult] = useState<EvaResult | null>(null);
  const [evaError, setEvaError] = useState('');

  // ADÁN
  const [adanInput, setAdanInput] = useState('');
  const [adanLoading, setAdanLoading] = useState(false);
  const [adanResult, setAdanResult] = useState<AdanAnswer | null>(null);
  const [adanError, setAdanError] = useState('');

  async function refreshKpis() {
    try {
      const [o, inv, st, integ] = await Promise.allSettled([
        api.getOrders(),
        api.getInvoices(),
        api.adanStats(),
        api.getIntegrationsStatus(),
      ]);
      if (o.status === 'fulfilled') setOrders(o.value.length);
      if (inv.status === 'fulfilled') setInvoices(inv.value.length);
      if (st.status === 'fulfilled') setAdanStats(st.value);
      if (integ.status === 'fulfilled') setIntegrations(integ.value);
    } catch {
      /* noop */
    }
  }

  useEffect(() => {
    // refreshKpis() es async y actualiza estado dentro de sus propios
    // callbacks .then/.catch (nunca de forma síncrona en el cuerpo del efecto).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshKpis();
  }, []);

  async function runEva(text: string) {
    const cmd = text.trim();
    if (!cmd) return;
    setEvaLoading(true);
    setEvaError('');
    setEvaResult(null);
    try {
      const data = await api.processEva(cmd);
      setEvaResult(data);
      refreshKpis();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setEvaError(msg || 'EVA no pudo procesar la instrucción.');
    } finally {
      setEvaLoading(false);
    }
  }

  async function runAdan(text: string) {
    const q = text.trim();
    if (!q) return;
    setAdanLoading(true);
    setAdanError('');
    setAdanResult(null);
    try {
      const data = await api.askAdan(q);
      setAdanResult(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setAdanError(msg || 'ADÁN no pudo responder.');
    } finally {
      setAdanLoading(false);
    }
  }

  return (
    <div className="space-y-8 text-slate-100">
      {/* Header */}
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
            <p className="text-slate-400 text-sm">DTA Oben · EVA ejecuta · ADÁN gobierna · 100% local</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            IA local en línea
          </span>
        </div>
      </header>

      {/* KPIs reales */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Receipt} label="Órdenes en sistema" value={orders === null ? '—' : String(orders)} hint="PostgreSQL · dato real" accent="emerald" />
        <KpiCard icon={FileText} label="Facturas creadas" value={invoices === null ? '—' : String(invoices)} hint="PostgreSQL · dato real" accent="sky" />
        <KpiCard icon={BookOpen} label="Documentos ADÁN" value={adanStats === null ? '—' : String(adanStats.documents)} hint={adanStats ? `${adanStats.chunks} chunks · ${adanStats.embeddings} embeddings` : 'memoria corporativa'} accent="violet" />
        <KpiCard icon={Network} label="Integraciones" value={String(integrations.length || 11)} hint={integrations.length ? `${integrations.filter((i) => i.state === 'operational').length} simuladores activos` : 'cargando…'} />
      </section>

      {/* ===== EVA ===== */}
      <section className="rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/80 to-slate-900/40 overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-700/60 px-6 py-4">
          <Brain className="w-5 h-5 text-emerald-400" />
          <div>
            <h2 className="font-semibold">EVA · Orquestación autónoma de pedidos</h2>
            <p className="text-xs text-slate-400">Lenguaje natural → LLM local → herramientas reales → orden y factura en PostgreSQL.</p>
          </div>
          <span className="ml-auto hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 text-xs text-emerald-300">
            <Sparkles className="w-3.5 h-3.5" /> {evaResult?.model || 'qwen2.5:3b'}
          </span>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400/70" />
              <input
                value={evaInput}
                onChange={(e) => setEvaInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runEva(evaInput)}
                placeholder='Ej: "Quiero 10 SKU-001 para ACME"'
                className="w-full rounded-xl bg-slate-950/70 border border-slate-700 pl-10 pr-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 transition"
              />
            </div>
            <button
              onClick={() => runEva(evaInput)}
              disabled={evaLoading || !evaInput.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:opacity-90 disabled:opacity-50"
            >
              {evaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Ejecutar
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-slate-500 py-1">Prueba:</span>
            {EVA_EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => { setEvaInput(ex); runEva(ex); }} className="rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-xs text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300 transition">{ex}</button>
            ))}
          </div>

          {evaLoading && (
            <p className="text-xs text-slate-400 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> EVA está razonando y ejecutando herramientas en el modelo local (CPU)…</p>
          )}

          {evaError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"><XCircle className="w-4 h-4" /> {evaError}</div>
          )}

          {evaResult && (
            <div className="space-y-3 pt-1">
              {/* Traza de herramientas reales */}
              {evaResult.trace.map((t, i) => (
                <ToolStage key={i} index={i + 1} tool={t.tool} result={t.result} />
              ))}

              {/* Resultado final */}
              <div className="rounded-xl border border-slate-700/60 bg-slate-950/50 p-4">
                <p className="text-sm text-slate-200">{evaResult.reply}</p>
                {(evaResult.orderNumber || evaResult.invoiceNumber) && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {evaResult.orderNumber && (
                      <span className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-300">Orden <b>{evaResult.orderNumber}</b></span>
                    )}
                    {evaResult.invoiceNumber && (
                      <span className="rounded-lg bg-sky-500/10 border border-sky-500/30 px-3 py-1.5 text-xs text-sky-300">Factura <b>{evaResult.invoiceNumber}</b></span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ===== ADÁN ===== */}
      <section className="rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/80 to-slate-900/40 overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-700/60 px-6 py-4">
          <BookOpen className="w-5 h-5 text-violet-400" />
          <div>
            <h2 className="font-semibold">ADÁN · Memoria corporativa (RAG local)</h2>
            <p className="text-xs text-slate-400">Pregunta sobre procesos y políticas. Responde citando documentos reales de Oben — sin inventar.</p>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-violet-400/70" />
              <input
                value={adanInput}
                onChange={(e) => setAdanInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runAdan(adanInput)}
                placeholder='Ej: "¿Cuál es el procedimiento para exportar a Perú?"'
                className="w-full rounded-xl bg-slate-950/70 border border-slate-700 pl-10 pr-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 transition"
              />
            </div>
            <button
              onClick={() => runAdan(adanInput)}
              disabled={adanLoading || !adanInput.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:opacity-90 disabled:opacity-50"
            >
              {adanLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Preguntar
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-slate-500 py-1">Prueba:</span>
            {ADAN_EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => { setAdanInput(ex); runAdan(ex); }} className="rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-xs text-slate-300 hover:border-violet-500/50 hover:text-violet-300 transition">{ex}</button>
            ))}
          </div>

          {adanLoading && (
            <p className="text-xs text-slate-400 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> ADÁN recupera contexto y redacta con el modelo local…</p>
          )}

          {adanError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"><XCircle className="w-4 h-4" /> {adanError}</div>
          )}

          {adanResult && (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-700/60 bg-slate-950/50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  {adanResult.grounded ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 border border-violet-500/30 px-2.5 py-1 text-xs text-violet-300"><CheckCircle2 className="w-3.5 h-3.5" /> Respuesta con fuentes</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 text-xs text-amber-300"><XCircle className="w-3.5 h-3.5" /> Sin documentos relevantes</span>
                  )}
                </div>
                <p className="text-sm text-slate-200 whitespace-pre-wrap">{adanResult.answer}</p>
              </div>

              {adanResult.sources.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-400">Fuentes ({adanResult.sources.length}):</p>
                  {adanResult.sources.map((s, i) => (
                    <div key={i} className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-violet-300 font-medium flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> {s.fileName} · #{s.chunkIndex}</span>
                        <span className="text-slate-500">similaridad {s.similarity}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400 line-clamp-2">{s.excerpt}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ===== Integraciones (estado real del Integration Hub) ===== */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Network className="w-5 h-5 text-emerald-400" />
          <h2 className="font-semibold">Integraciones del ecosistema Oben</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {integrations.map((it) => {
            const meta = INTEGRATION_META[it.system] ?? { label: it.system, role: it.mode, icon: Network };
            const Icon = meta.icon;
            const s = stateStyles[it.state];
            return (
              <div key={it.system} className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center"><Icon className="w-5 h-5 text-slate-200" /></div>
                  <div>
                    <p className="font-semibold text-slate-100 text-sm">{meta.label}</p>
                    <p className="text-xs text-slate-400">{meta.role}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center text-xs">
                  <span className={`inline-flex items-center gap-1.5 ${s.text}`}><span className={`w-2 h-2 rounded-full ${s.dot}`} /> {s.label}</span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-slate-500 leading-relaxed">
          Cada sistema corre hoy sobre un simulador funcional: mismas operaciones, mismas validaciones de negocio,
          mismos errores que tendría la API real. Conectar NetSuite, VETA o Armstrong reales solo requiere las
          credenciales de Oben — el resto del sistema no cambia.
        </p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
function KpiCard({ icon: Icon, label, value, hint, accent = 'slate' }: { icon: React.ElementType; label: string; value: string; hint: string; accent?: 'slate' | 'emerald' | 'sky' | 'violet'; }) {
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
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accents[accent]}`}><Icon className="w-4 h-4" /></div>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-50">{value}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>
    </div>
  );
}

function ToolStage({ index, tool, result }: { index: number; tool: string; result: unknown }) {
  const r = (result || {}) as Record<string, unknown>;
  const ok = r.ok === true || r.found === true || (tool === 'ValidateCredit' && r.ok === true);
  const failed = r.ok === false || r.found === false;
  const iconByTool: Record<string, React.ElementType> = {
    GetClient: Building2,
    GetProduct: Package,
    ValidateCredit: ShieldCheck,
    CreateOrder: Receipt,
    CreateInvoice: FileText,
  };
  const Icon = iconByTool[tool] || Workflow;

  let detail = '';
  if (tool === 'GetClient' && r.found) detail = `${r.name} · cupo ${money(r.availableCredit as number)}`;
  else if (tool === 'GetProduct' && r.found) detail = `${r.name} · ${money(r.price as number)} · stock ${r.stock}`;
  else if (tool === 'ValidateCredit') detail = String(r.decisionReason || '');
  else if (tool === 'CreateOrder' && r.ok) detail = `${r.orderNumber} · ${money(r.totalAmount as number)}`;
  else if (tool === 'CreateInvoice' && r.ok) detail = `${r.invoiceNumber} · IVA ${money(r.taxAmount as number)} · total ${money(r.totalAmount as number)}`;
  else if (failed) detail = String(r.error || 'No encontrado');

  return (
    <div className="flex gap-3 rounded-xl border border-slate-700/60 bg-slate-950/40 p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${failed ? 'bg-red-500/15 text-red-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-200">{index} · {tool}</h3>
          {failed ? <XCircle className="w-4 h-4 text-red-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {ok && <ArrowRight className="w-3.5 h-3.5 text-slate-600" />}
        </div>
        <p className="mt-1 text-xs text-slate-400 break-words">{detail}</p>
      </div>
    </div>
  );
}
