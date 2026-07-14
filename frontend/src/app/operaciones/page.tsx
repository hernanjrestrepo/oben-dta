'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { IntegrationStatus } from '@/types';
import {
  Receipt,
  Workflow,
  Network,
  Building2,
  Factory,
  ShieldCheck,
  Package,
  Ship,
  Radio,
  FileText,
  Activity,
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

export default function OperacionesPage() {
  const [orders, setOrders] = useState<number | null>(null);
  const [invoices, setInvoices] = useState<number | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);

  async function refreshKpis() {
    try {
      const [o, inv, integ] = await Promise.allSettled([
        api.getOrders(),
        api.getInvoices(),
        api.getIntegrationsStatus(),
      ]);
      if (o.status === 'fulfilled') setOrders(o.value.length);
      if (inv.status === 'fulfilled') setInvoices(inv.value.length);
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

  return (
    <div className="space-y-8 text-slate-100">
      {/* Header */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-sky-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Activity className="w-8 h-8 text-slate-950" />
            </div>
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-[#0b1220] animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Centro de Operaciones</h1>
            <p className="text-slate-400 text-sm">DTA Oben · estado en vivo del ecosistema de integraciones</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Sistema en línea
          </span>
        </div>
      </header>

      {/* KPIs reales */}
      <section className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard icon={Receipt} label="Órdenes en sistema" value={orders === null ? '—' : String(orders)} hint="PostgreSQL · dato real" accent="emerald" />
        <KpiCard icon={FileText} label="Facturas creadas" value={invoices === null ? '—' : String(invoices)} hint="PostgreSQL · dato real" accent="sky" />
        <KpiCard icon={Network} label="Integraciones" value={String(integrations.length || 11)} hint={integrations.length ? `${integrations.filter((i) => i.state === 'operational').length} simuladores activos` : 'cargando…'} />
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
