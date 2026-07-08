'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import { Tenant } from '@/types';
import { Loader2, AlertCircle, Plus, ArrowRight } from 'lucide-react';

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  trial: 'bg-blue-100 text-blue-700',
  suspended: 'bg-yellow-100 text-yellow-700',
  archived: 'bg-gray-100 text-gray-500',
};

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ slug: '', name: '', legalName: '', countryCode: 'CO', defaultCurrency: 'COP' });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      setError('');
      setTenants(await api.getTenants());
    } catch (err: unknown) {
      setError(extractMessage(err, 'Error cargando tenants'));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!form.slug.trim() || !form.name.trim()) {
      setFormError('Slug y nombre son obligatorios');
      return;
    }
    try {
      setSaving(true);
      await api.createTenant(form);
      setForm({ slug: '', name: '', legalName: '', countryCode: 'CO', defaultCurrency: 'COP' });
      setShowForm(false);
      await load();
    } catch (err: unknown) {
      setFormError(extractMessage(err, 'Error creando tenant'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Empresas (Tenants)</h1>
          <p className="text-gray-500 mt-1">Administración de empresas clientes del SaaS</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="bg-gray-900 hover:bg-gray-800 text-white font-semibold px-4 py-2.5 rounded-lg flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nuevo tenant
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {formError}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Slug (único)" value={form.slug} onChange={(v) => setForm({ ...form, slug: v.toLowerCase() })} placeholder="mi-empresa" />
            <Field label="Nombre" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Mi Empresa S.A.S." />
            <Field label="Razón social" value={form.legalName} onChange={(v) => setForm({ ...form, legalName: v })} placeholder="Mi Empresa S.A.S." />
            <Field label="País (ISO2)" value={form.countryCode} onChange={(v) => setForm({ ...form, countryCode: v.toUpperCase() })} placeholder="CO" />
          </div>
          <button type="submit" disabled={saving} className="bg-gray-900 hover:bg-gray-800 text-white font-semibold px-4 py-2.5 rounded-lg disabled:opacity-60">
            {saving ? 'Creando...' : 'Crear tenant'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-gray-700 animate-spin" /></div>
      ) : error ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Slug</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Nombre</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">País</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Estado</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Creado</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tenants.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No hay tenants registrados</td></tr>
                ) : (
                  tenants.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 font-mono text-gray-700">{t.slug}</td>
                      <td className="px-6 py-4 font-medium text-gray-900">{t.name}</td>
                      <td className="px-6 py-4 text-gray-500">{t.countryCode}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${statusColors[t.status] || 'bg-gray-100 text-gray-700'}`}>{t.status}</span>
                      </td>
                      <td className="px-6 py-4 text-gray-500">{new Date(t.createdAt).toLocaleDateString('es-CO')}</td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/platform/tenants/${t.id}`} className="text-gray-700 hover:underline flex items-center gap-1 justify-end">
                          Administrar <ArrowRight className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-gray-800 outline-none text-gray-900"
      />
    </div>
  );
}
