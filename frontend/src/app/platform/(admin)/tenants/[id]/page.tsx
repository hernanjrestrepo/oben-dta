'use client';

import { useEffect, useState, use as usePromise } from 'react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import { CommercialLicense, Plan, Tenant, TenantFeatureFlag, TenantSubscription } from '@/types';
import { Loader2, AlertCircle, CheckCircle2, XCircle, ShieldCheck, ShieldAlert } from 'lucide-react';

interface LicenseView {
  tenantId: string;
  planKey: string | null;
  subscriptionStatus: string | null;
  modulesEnabled: string[];
  planModules: string[];
  flagOverrides: Record<string, boolean>;
  commercialLicense: CommercialLicense | null;
  valid: boolean;
  reason: string | null;
  graceActive: boolean;
  daysRemaining: number | null;
  renewalDue: boolean;
}

export default function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<TenantSubscription | null>(null);
  const [flags, setFlags] = useState<TenantFeatureFlag[]>([]);
  const [license, setLicense] = useState<LicenseView | null>(null);
  const [modules, setModules] = useState<Array<{ key: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [planKey, setPlanKey] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [licenseDurationDays, setLicenseDurationDays] = useState(30);
  const [licenseMaxUsers, setLicenseMaxUsers] = useState(10);
  const [licenseSaving, setLicenseSaving] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    try {
      setLoading(true);
      setError('');
      const [t, p, sub, fl, lic, mods] = await Promise.all([
        api.getTenant(id),
        api.getPlans(),
        api.getTenantSubscription(id).catch(() => null),
        api.getFeatureFlags(id),
        api.getTenantLicense(id).catch(() => null),
        api.getModules(),
      ]);
      setTenant(t);
      setPlans(p);
      setSubscription(sub);
      setFlags(fl);
      setLicense(lic);
      setModules(mods);
      setPlanKey(sub?.plan?.key ?? p[0]?.key ?? '');
      setEndsAt(sub?.endsAt ? sub.endsAt.slice(0, 10) : '');
    } catch (err: unknown) {
      setError(extractMessage(err, 'Error cargando el tenant'));
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignSubscription(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      await api.assignSubscription(id, { planKey, endsAt: endsAt || undefined });
      await load();
    } catch (err: unknown) {
      setError(extractMessage(err, 'Error asignando suscripción'));
    } finally {
      setSaving(false);
    }
  }

  async function handleIssueLicense(e: React.FormEvent) {
    e.preventDefault();
    try {
      setLicenseSaving(true);
      await api.issueLicense(id, { planKey, durationDays: licenseDurationDays, maxUsers: licenseMaxUsers });
      await load();
    } catch (err: unknown) {
      setError(extractMessage(err, 'Error emitiendo licencia'));
    } finally {
      setLicenseSaving(false);
    }
  }

  async function handleRenewLicense() {
    try {
      setLicenseSaving(true);
      await api.renewLicense(id, { durationDays: licenseDurationDays });
      await load();
    } catch (err: unknown) {
      setError(extractMessage(err, 'Error renovando licencia'));
    } finally {
      setLicenseSaving(false);
    }
  }

  async function toggleFlag(moduleKey: string, enabled: boolean) {
    try {
      await api.setFeatureFlag(id, { moduleKey, enabled });
      await load();
    } catch (err: unknown) {
      setError(extractMessage(err, 'Error actualizando feature flag'));
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 text-gray-700 animate-spin" /></div>;
  }
  if (!tenant) {
    return <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error || 'Tenant no encontrado'}</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{tenant.name}</h1>
        <p className="text-gray-500 mt-1 font-mono text-sm">{tenant.slug} · {tenant.id}</p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* Suscripción / Licencia */}
      <section className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Suscripción y licencia</h2>
        <form onSubmit={handleAssignSubscription} className="flex flex-wrap items-end gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
            <select value={planKey} onChange={(e) => setPlanKey(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900">
              {plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vence (opcional)</label>
            <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900" />
          </div>
          <button type="submit" disabled={saving} className="bg-gray-900 hover:bg-gray-800 text-white font-semibold px-4 py-2.5 rounded-lg disabled:opacity-60">
            {saving ? 'Guardando...' : 'Asignar suscripción'}
          </button>
        </form>

        {subscription && (
          <div className="text-sm text-gray-600 grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div><span className="text-gray-400">Estado:</span> <span className="font-semibold">{subscription.status}</span></div>
            <div><span className="text-gray-400">Desde:</span> {new Date(subscription.startsAt).toLocaleDateString('es-CO')}</div>
            <div><span className="text-gray-400">Vence:</span> {subscription.endsAt ? new Date(subscription.endsAt).toLocaleDateString('es-CO') : 'Sin vencimiento'}</div>
          </div>
        )}

        {license && (
          <div>
            <p className="text-sm text-gray-500 mb-2">Módulos habilitados por licencia efectiva:</p>
            <div className="flex flex-wrap gap-2">
              {license.modulesEnabled.length === 0 ? (
                <span className="text-gray-400 text-sm">Ninguno</span>
              ) : (
                license.modulesEnabled.map((m) => (
                  <span key={m} className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">{m}</span>
                ))
              )}
            </div>
          </div>
        )}
      </section>

      {/* Licencia comercial */}
      <section className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Licencia comercial</h2>
          {license && (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
              license.valid ? (license.graceActive ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700') : 'bg-red-100 text-red-700'
            }`}>
              {license.valid ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
              {license.valid ? (license.graceActive ? 'Válida (período de gracia)' : 'Válida') : `Inválida (${license.reason})`}
            </span>
          )}
        </div>

        {license?.commercialLicense && (
          <div className="text-sm text-gray-600 grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div><span className="text-gray-400">Installation ID:</span> <span className="font-mono text-xs">{license.commercialLicense.installationId.slice(0, 8)}</span></div>
            <div><span className="text-gray-400">Emitida:</span> {new Date(license.commercialLicense.issuedAt).toLocaleDateString('es-CO')}</div>
            <div><span className="text-gray-400">Vence:</span> {new Date(license.commercialLicense.expiresAt).toLocaleDateString('es-CO')}</div>
            <div><span className="text-gray-400">Máx. usuarios:</span> {license.commercialLicense.maxUsers}</div>
            {license.daysRemaining !== null && (
              <div><span className="text-gray-400">Días restantes:</span> {license.daysRemaining}</div>
            )}
            {license.renewalDue && (
              <div className="text-amber-600 font-semibold">Renovación recomendada</div>
            )}
          </div>
        )}

        <form onSubmit={handleIssueLicense} className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duración (días)</label>
            <input
              type="number"
              value={licenseDurationDays}
              onChange={(e) => setLicenseDurationDays(Number(e.target.value))}
              className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Máx. usuarios</label>
            <input
              type="number"
              value={licenseMaxUsers}
              onChange={(e) => setLicenseMaxUsers(Number(e.target.value))}
              className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
            />
          </div>
          <button type="submit" disabled={licenseSaving} className="bg-gray-900 hover:bg-gray-800 text-white font-semibold px-4 py-2.5 rounded-lg disabled:opacity-60">
            {licenseSaving ? 'Guardando...' : (license?.commercialLicense ? 'Re-emitir licencia' : 'Emitir licencia')}
          </button>
          {license?.commercialLicense && (
            <button type="button" onClick={handleRenewLicense} disabled={licenseSaving} className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-900 font-semibold px-4 py-2.5 rounded-lg disabled:opacity-60">
              Renovar por {licenseDurationDays} días
            </button>
          )}
        </form>
      </section>

      {/* Feature flags */}
      <section className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Feature flags</h2>
        <p className="text-sm text-gray-500 mb-4">Override manual por módulo, independiente del plan contratado.</p>
        <div className="divide-y divide-gray-100">
          {modules.map((mod) => {
            const flag = flags.find((f) => f.moduleKey === mod.key);
            const enabled = flag?.enabled ?? false;
            return (
              <div key={mod.key} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-gray-900">{mod.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{mod.key}</p>
                </div>
                <button
                  onClick={() => toggleFlag(mod.key, !enabled)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold transition ${
                    enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {enabled ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  {enabled ? 'Habilitado' : 'Deshabilitado'}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
