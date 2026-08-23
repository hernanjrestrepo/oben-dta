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
  operational: { dot: 'bg-green-500', text: 'text-green-700', label: 'Simulador activo' },
  pending_credentials: { dot: 'bg-amber-500', text: 'text-amber-700', label: 'Pendiente de integración externa' },
  unreachable: { dot: 'bg-red-500', text: 'text-red-700', label: 'No alcanzable' },
  error: { dot: 'bg-red-500', text: 'text-red-700', label: 'Error' },
  disabled: { dot: 'bg-gray-400', text: 'text-gray-500', label: 'Deshabilitado' },
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[#F47735] flex items-center justify-center shrink-0">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Centro de Operaciones</h1>
            <p className="text-gray-500 text-sm">Estado en vivo del ecosistema de integraciones</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-sm text-green-700">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Sistema en línea
        </span>
      </div>

      {/* KPIs reales */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard icon={Receipt} label="Órdenes en sistema" value={orders === null ? '—' : String(orders)} hint="PostgreSQL · dato real" />
        <KpiCard icon={FileText} label="Facturas creadas" value={invoices === null ? '—' : String(invoices)} hint="PostgreSQL · dato real" />
        <KpiCard icon={Network} label="Integraciones" value={String(integrations.length || 11)} hint={integrations.length ? `${integrations.filter((i) => i.state === 'operational').length} simuladores activos` : 'cargando…'} />
      </div>

      {/* ===== Integraciones (estado real del Integration Hub) ===== */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Network className="w-5 h-5 text-[#F47735]" />
          <h2 className="font-semibold text-gray-900">Integraciones del ecosistema Oben</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {integrations.map((it) => {
            const meta = INTEGRATION_META[it.system] ?? { label: it.system, role: it.mode, icon: Network };
            const Icon = meta.icon;
            const s = stateStyles[it.state];
            return (
              <div key={it.system} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center"><Icon className="w-5 h-5 text-[#F47735]" /></div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{meta.label}</p>
                    <p className="text-xs text-gray-500">{meta.role}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center text-xs">
                  <span className={`inline-flex items-center gap-1.5 ${s.text}`}><span className={`w-2 h-2 rounded-full ${s.dot}`} /> {s.label}</span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-gray-500 leading-relaxed">
          Cada sistema corre hoy sobre un simulador funcional: mismas operaciones, mismas validaciones de negocio,
          mismos errores que tendría la API real. Conectar NetSuite, VETA o Armstrong reales solo requiere las
          credenciales de Oben — el resto del sistema no cambia.
        </p>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
function KpiCard({ icon: Icon, label, value, hint }: { icon: React.ElementType; label: string; value: string; hint: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-50 text-[#F47735]"><Icon className="w-4 h-4" /></div>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>
    </div>
  );
}
