'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { SecurityRole, TenantUser } from '@/types';
import {
  Plus,
  Loader2,
  AlertCircle,
  Lock,
  Unlock,
  KeyRound,
  Trash2,
  ShieldCheck,
  Users as UsersIcon,
} from 'lucide-react';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [roles, setRoles] = useState<SecurityRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', roleKeys: [] as string[] });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const [resetTarget, setResetTarget] = useState<TenantUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      setError('');
      const [u, r] = await Promise.all([api.getTenantUsers(), api.getRoles()]);
      setUsers(u);
      setRoles(r);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Error cargando usuarios');
    } finally {
      setLoading(false);
    }
  }

  function errMsg(err: unknown, fallback: string) {
    return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setCreateError('Nombre y apellido son obligatorios');
      return;
    }
    if (!form.email.trim()) {
      setCreateError('El correo es obligatorio');
      return;
    }
    if (form.password.length < 8) {
      setCreateError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    try {
      setCreating(true);
      await api.createTenantUser({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        password: form.password,
        roleKeys: form.roleKeys,
      });
      setShowCreate(false);
      setForm({ firstName: '', lastName: '', email: '', password: '', roleKeys: [] });
      await load();
    } catch (err) {
      setCreateError(errMsg(err, 'Error creando el usuario'));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(user: TenantUser) {
    if (!confirm(`¿Eliminar a ${user.firstName} ${user.lastName}? Esta acción no se puede deshacer.`)) return;
    try {
      setBusyId(user.id);
      await api.deleteTenantUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err) {
      alert(errMsg(err, 'Error eliminando usuario'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleActive(user: TenantUser) {
    try {
      setBusyId(user.id);
      const updated = user.isActive
        ? await api.deactivateTenantUser(user.id)
        : await api.activateTenantUser(user.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err) {
      alert(errMsg(err, 'Error actualizando usuario'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleLock(user: TenantUser) {
    try {
      setBusyId(user.id);
      const updated = user.isLocked ? await api.unlockTenantUser(user.id) : await api.lockTenantUser(user.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err) {
      alert(errMsg(err, 'Error actualizando bloqueo'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleRole(user: TenantUser, roleKey: string) {
    try {
      setBusyId(user.id);
      const hasRole = user.roles.includes(roleKey);
      if (hasRole) {
        await api.unassignUserRole(user.id, roleKey);
      } else {
        await api.assignUserRole(user.id, roleKey);
      }
      const updated = await api.getTenantUser(user.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err) {
      alert(errMsg(err, 'Error actualizando perfiles'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setResetError('');
    if (resetPassword.length < 8) {
      setResetError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    try {
      setBusyId(resetTarget.id);
      await api.resetTenantUserPassword(resetTarget.id, resetPassword);
      setResetTarget(null);
      setResetPassword('');
    } catch (err) {
      setResetError(errMsg(err, 'Error reiniciando la contraseña'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
          <p className="text-gray-500 mt-1">Administra los usuarios y perfiles del tenant</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/roles"
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition"
          >
            <ShieldCheck className="w-4 h-4" />
            Perfiles y Permisos
          </Link>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 bg-[#003366] hover:bg-[#004080] text-white px-4 py-2.5 rounded-lg font-medium transition"
          >
            <Plus className="w-5 h-5" />
            Nuevo Usuario
          </button>
        </div>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Nuevo Usuario</h2>
          {createError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{createError}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003366] focus:border-[#003366] outline-none transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Apellido *</label>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003366] focus:border-[#003366] outline-none transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Correo *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003366] focus:border-[#003366] outline-none transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña temporal *</label>
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Mínimo 8 caracteres"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003366] focus:border-[#003366] outline-none transition"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Perfiles</label>
            <div className="flex flex-wrap gap-2">
              {roles.map((role) => (
                <label
                  key={role.key}
                  className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm cursor-pointer hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={form.roleKeys.includes(role.key)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        roleKeys: e.target.checked
                          ? [...f.roleKeys, role.key]
                          : f.roleKeys.filter((k) => k !== role.key),
                      }))
                    }
                  />
                  {role.name}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-6 py-2.5 bg-[#003366] hover:bg-[#004080] text-white rounded-lg font-medium transition disabled:opacity-60 flex items-center gap-2"
            >
              {creating && <Loader2 className="w-4 h-4 animate-spin" />}
              Crear Usuario
            </button>
          </div>
        </form>
      )}

      {resetTarget && (
        <form onSubmit={handleResetPassword} className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Reiniciar contraseña — {resetTarget.firstName} {resetTarget.lastName}
          </h2>
          {resetError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{resetError}</p>
            </div>
          )}
          <input
            type="text"
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            placeholder="Nueva contraseña temporal (mínimo 8 caracteres)"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003366] focus:border-[#003366] outline-none transition"
          />
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => { setResetTarget(null); setResetPassword(''); setResetError(''); }}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-[#003366] hover:bg-[#004080] text-white rounded-lg font-medium transition"
            >
              Reiniciar Contraseña
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#003366] animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-2" />
              <p className="text-red-600">{error}</p>
              <button onClick={load} className="mt-3 text-[#003366] hover:underline">Reintentar</button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Usuario</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Correo</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Perfiles</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Estado</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.length ? (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 transition align-top">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                            <UsersIcon className="w-4 h-4 text-[#003366]" />
                          </div>
                          <span className="font-medium text-gray-900">{user.firstName} {user.lastName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-700">{user.email}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5 max-w-xs">
                          {roles.map((role) => {
                            const assigned = user.roles.includes(role.key);
                            return (
                              <button
                                key={role.key}
                                onClick={() => handleToggleRole(user, role.key)}
                                disabled={busyId === user.id}
                                className={`px-2 py-0.5 rounded-full text-xs font-medium transition ${
                                  assigned
                                    ? 'bg-blue-100 text-[#003366] border border-blue-200'
                                    : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200'
                                }`}
                                title={assigned ? `Quitar perfil ${role.name}` : `Asignar perfil ${role.name}`}
                              >
                                {role.name}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex w-fit px-2 py-0.5 rounded-full text-xs font-semibold ${
                            user.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {user.isActive ? 'Activo' : 'Inactivo'}
                          </span>
                          {user.isLocked && (
                            <span className="inline-flex w-fit px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                              Bloqueado
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleToggleActive(user)}
                            disabled={busyId === user.id}
                            className="px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
                            title={user.isActive ? 'Desactivar' : 'Activar'}
                          >
                            {user.isActive ? 'Desactivar' : 'Activar'}
                          </button>
                          <button
                            onClick={() => handleToggleLock(user)}
                            disabled={busyId === user.id}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
                            title={user.isLocked ? 'Desbloquear' : 'Bloquear'}
                          >
                            {user.isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => { setResetTarget(user); setResetPassword(''); setResetError(''); }}
                            disabled={busyId === user.id}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
                            title="Reiniciar contraseña"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(user)}
                            disabled={busyId === user.id}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                            title="Eliminar"
                          >
                            {busyId === user.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                      No hay usuarios registrados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
