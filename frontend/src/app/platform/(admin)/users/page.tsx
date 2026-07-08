'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { extractMessage } from '@/lib/errors';
import { PlatformRole, PlatformUser } from '@/types';
import { Loader2, AlertCircle, Plus, Trash2, Ban, CheckCircle2 } from 'lucide-react';

export default function PlatformUsersPage() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', platformRoleKey: 'platform.support' });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      setError('');
      const [u, r] = await Promise.all([api.getPlatformUsers(), api.getPlatformRoles()]);
      setUsers(u);
      setRoles(r);
      if (r.length > 0) setForm((f) => ({ ...f, platformRoleKey: f.platformRoleKey || r[0].key }));
    } catch (err: unknown) {
      setError(extractMessage(err, 'Error cargando usuarios de plataforma'));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!form.firstName || !form.lastName || !form.email || form.password.length < 8) {
      setFormError('Todos los campos son obligatorios; la contraseña debe tener al menos 8 caracteres');
      return;
    }
    try {
      setSaving(true);
      await api.createPlatformUser(form);
      setForm({ firstName: '', lastName: '', email: '', password: '', platformRoleKey: roles[0]?.key ?? '' });
      setShowForm(false);
      await load();
    } catch (err: unknown) {
      setFormError(extractMessage(err, 'Error creando usuario'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: PlatformUser) {
    try {
      await api.updatePlatformUser(u.id, { isActive: !u.isActive });
      await load();
    } catch (err: unknown) {
      setError(extractMessage(err, 'Error actualizando usuario'));
    }
  }

  async function remove(u: PlatformUser) {
    if (!confirm(`¿Eliminar a ${u.firstName} ${u.lastName}?`)) return;
    try {
      await api.deletePlatformUser(u.id);
      await load();
    } catch (err: unknown) {
      setError(extractMessage(err, 'Error eliminando usuario'));
    }
  }

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 text-gray-700 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuarios de plataforma</h1>
          <p className="text-gray-500 mt-1">Cuentas Paradixe sin tenant, con roles de plataforma</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="bg-gray-900 hover:bg-gray-800 text-white font-semibold px-4 py-2.5 rounded-lg flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nuevo usuario
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} />
            <Field label="Apellido" value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} />
            <Field label="Correo" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
            <Field label="Contraseña" value={form.password} onChange={(v) => setForm({ ...form, password: v })} type="password" />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rol de plataforma</label>
              <select
                value={form.platformRoleKey}
                onChange={(e) => setForm({ ...form, platformRoleKey: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
              >
                {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" disabled={saving} className="bg-gray-900 hover:bg-gray-800 text-white font-semibold px-4 py-2.5 rounded-lg disabled:opacity-60">
            {saving ? 'Creando...' : 'Crear usuario'}
          </button>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-3 text-left font-semibold text-gray-600">Nombre</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-600">Correo</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-600">Roles</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-600">Estado</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">No hay usuarios de plataforma</td></tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 font-medium text-gray-900">{u.firstName} {u.lastName}</td>
                    <td className="px-6 py-4 text-gray-600">{u.email}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {u.platformRoles.map((r) => (
                          <span key={r} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-mono">{r}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-3">
                        <button onClick={() => toggleActive(u)} className="text-gray-500 hover:text-gray-900" title={u.isActive ? 'Desactivar' : 'Activar'}>
                          {u.isActive ? <Ban className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                        </button>
                        <button onClick={() => remove(u)} className="text-red-500 hover:text-red-700" title="Eliminar">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900" />
    </div>
  );
}
