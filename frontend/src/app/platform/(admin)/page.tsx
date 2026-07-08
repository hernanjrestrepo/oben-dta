'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { SystemStatus } from '@/types';
import { Loader2, AlertCircle, Database, Building2, CreditCard, Users, Clock } from 'lucide-react';

export default function PlatformStatusPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      setError('');
      const data = await api.getSystemStatus();
      setStatus(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Error cargando el estado del sistema');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-gray-700 animate-spin" />
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <p className="text-red-600 font-medium">{error}</p>
          <button onClick={load} className="mt-4 text-gray-700 hover:underline">Reintentar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estado del sistema</h1>
          <p className="text-gray-500 mt-1">Resumen administrativo de la plataforma SaaS</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${status.status === 'ok' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {status.status === 'ok' ? 'Operativo' : 'Degradado'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card icon={Database} title="Base de datos" value={status.database.status === 'ok' ? 'OK' : 'Error'} sub={`${status.database.migrationsApplied} migraciones aplicadas`} />
        <Card icon={Building2} title="Tenants" value={status.tenants.total} sub={breakdown(status.tenants)} />
        <Card icon={CreditCard} title="Suscripciones" value={status.subscriptions.total} sub={breakdown(status.subscriptions)} />
        <Card icon={Users} title="Usuarios plataforma" value={status.platformUsers.total} sub={`${status.platformUsers.active} activos · ${status.platformUsers.superAdmins} superadmin`} />
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 flex items-center gap-3 text-sm text-gray-500">
        <Clock className="w-4 h-4" />
        Uptime del proceso: {formatUptime(status.uptimeSeconds)} · Consultado {new Date(status.timestamp).toLocaleString('es-CO')}
      </div>
    </div>
  );
}

function breakdown(rec: Record<string, number> & { total: number }): string {
  return Object.entries(rec)
    .filter(([k]) => k !== 'total')
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ') || 'sin datos';
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function Card({ icon: Icon, title, value, sub }: { icon: React.ElementType; title: string; value: string | number; sub: string }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className="w-12 h-12 bg-gray-900 rounded-lg flex items-center justify-center">
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-3">{sub}</p>
    </div>
  );
}
