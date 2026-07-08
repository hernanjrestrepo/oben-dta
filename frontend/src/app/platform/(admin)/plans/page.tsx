'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import { Plan } from '@/types';
import { Loader2, AlertCircle, Plus } from 'lucide-react';

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [modules, setModules] = useState<Array<{ key: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ key: '', name: '', priceMonthly: 0, maxUsers: 10, maxStorageGb: 5, modules: [] as string[] });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      setError('');
      const [p, m] = await Promise.all([api.getPlans(), api.getModules()]);
      setPlans(p);
      setModules(m);
    } catch (err: unknown) {
      setError(extractMessage(err, 'Error cargando planes'));
    } finally {
      setLoading(false);
    }
  }

  function toggleModule(key: string) {
    setForm((f) => ({
      ...f,
      modules: f.modules.includes(key) ? f.modules.filter((m) => m !== key) : [...f.modules, key],
    }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!form.key.trim() || !form.name.trim()) {
      setFormError('Key y nombre son obligatorios');
      return;
    }
    try {
      setSaving(true);
      await api.createPlan(form);
      setForm({ key: '', name: '', priceMonthly: 0, maxUsers: 10, maxStorageGb: 5, modules: [] });
      setShowForm(false);
      await load();
    } catch (err: unknown) {
      setFormError(extractMessage(err, 'Error creando plan'));
    } finally {
      setSaving(false);
    }
  }

  async function updateModules(plan: Plan, moduleKey: string) {
    const next = plan.modules.includes(moduleKey)
      ? plan.modules.filter((m) => m !== moduleKey)
      : [...plan.modules, moduleKey];
    try {
      await api.updatePlanModules(plan.key, next);
      await load();
    } catch (err: unknown) {
      setError(extractMessage(err, 'Error actualizando módulos del plan'));
    }
  }

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 text-gray-700 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planes</h1>
          <p className="text-gray-500 mt-1">Catálogo de planes comerciales del SaaS</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="bg-gray-900 hover:bg-gray-800 text-white font-semibold px-4 py-2.5 rounded-lg flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nuevo plan
        </button>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {formError}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Field label="Key" value={form.key} onChange={(v) => setForm({ ...form, key: v })} placeholder="pro-plus" />
            <Field label="Nombre" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Pro Plus" />
            <NumField label="Precio mensual (USD)" value={form.priceMonthly} onChange={(v) => setForm({ ...form, priceMonthly: v })} />
            <NumField label="Máx. usuarios" value={form.maxUsers} onChange={(v) => setForm({ ...form, maxUsers: v })} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Módulos incluidos</p>
            <div className="flex flex-wrap gap-2">
              {modules.map((m) => (
                <button
                  type="button"
                  key={m.key}
                  onClick={() => toggleModule(m.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                    form.modules.includes(m.key) ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" disabled={saving} className="bg-gray-900 hover:bg-gray-800 text-white font-semibold px-4 py-2.5 rounded-lg disabled:opacity-60">
            {saving ? 'Creando...' : 'Crear plan'}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div key={plan.key} className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-gray-900">{plan.name}</h3>
              <span className="text-xs font-mono text-gray-400">{plan.key}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 mb-1">${plan.priceMonthly} <span className="text-sm font-normal text-gray-400">/mes</span></p>
            <p className="text-sm text-gray-500 mb-4">Hasta {plan.maxUsers} usuarios · {plan.maxStorageGb}GB</p>
            <p className="text-xs font-medium text-gray-500 mb-2">Módulos:</p>
            <div className="flex flex-wrap gap-1.5">
              {modules.map((m) => (
                <button
                  key={m.key}
                  onClick={() => updateModules(plan, m.key)}
                  className={`px-2 py-1 rounded text-xs font-medium transition ${
                    plan.modules.includes(m.key) ? 'bg-green-100 text-green-700' : 'bg-gray-50 text-gray-400'
                  }`}
                  title="Click para alternar"
                >
                  {m.key}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900" />
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900" />
    </div>
  );
}
