'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { SecurityModuleCatalog, SecurityPermission, SecurityRole } from '@/types';
import {
  ArrowLeft,
  Plus,
  Loader2,
  AlertCircle,
  Trash2,
  Lock,
} from 'lucide-react';

const ACTION_LABELS: Record<string, string> = {
  read: 'Ver',
  create: 'Crear',
  update: 'Editar',
  delete: 'Eliminar',
  view: 'Ver',
  use: 'Usar',
  approve: 'Aprobar',
  execute: 'Ejecutar',
};

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

export default function AdminRolesPage() {
  const [roles, setRoles] = useState<SecurityRole[]>([]);
  const [modules, setModules] = useState<SecurityModuleCatalog[]>([]);
  const [permissions, setPermissions] = useState<SecurityPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ key: '', name: '', description: '', isActive: true, permissions: [] as string[] });
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      setError('');
      const [r, m, p] = await Promise.all([
        api.getRoles(),
        api.getSecurityModules(),
        api.getSecurityPermissions(),
      ]);
      setRoles(r);
      setModules(m);
      setPermissions(p);
    } catch (err) {
      setError(errMsg(err, 'Error cargando perfiles'));
    } finally {
      setLoading(false);
    }
  }

  const permsByModule = useMemo(() => {
    const map = new Map<string, SecurityPermission[]>();
    for (const p of permissions) {
      if (!map.has(p.moduleKey)) map.set(p.moduleKey, []);
      map.get(p.moduleKey)!.push(p);
    }
    return map;
  }, [permissions]);

  function moduleLabel(key: string) {
    return modules.find((m) => m.key === key)?.name || key;
  }

  function startNew() {
    setIsNew(true);
    setSelectedKey(null);
    setSaveError('');
    setEditForm({ key: '', name: '', description: '', isActive: true, permissions: [] });
  }

  function startEdit(role: SecurityRole) {
    setIsNew(false);
    setSelectedKey(role.key);
    setSaveError('');
    setEditForm({
      key: role.key,
      name: role.name,
      description: role.description || '',
      isActive: role.isActive,
      permissions: role.permissions.map((p) => p.key),
    });
  }

  function togglePermission(key: string) {
    setEditForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((k) => k !== key)
        : [...f.permissions, key],
    }));
  }

  function toggleModule(moduleKey: string, checked: boolean) {
    const moduleKeys = (permsByModule.get(moduleKey) || []).map((p) => p.key);
    setEditForm((f) => ({
      ...f,
      permissions: checked
        ? Array.from(new Set([...f.permissions, ...moduleKeys]))
        : f.permissions.filter((k) => !moduleKeys.includes(k)),
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError('');
    if (isNew) {
      if (!editForm.key.trim() || !editForm.name.trim()) {
        setSaveError('Clave y nombre son obligatorios');
        return;
      }
    }
    try {
      setSaving(true);
      if (isNew) {
        await api.createRole({
          key: editForm.key.trim(),
          name: editForm.name.trim(),
          description: editForm.description.trim() || undefined,
          permissions: editForm.permissions,
        });
      } else if (selectedKey) {
        await api.updateRole(selectedKey, {
          name: editForm.name.trim(),
          description: editForm.description.trim() || undefined,
          isActive: editForm.isActive,
          permissions: editForm.permissions,
        });
      }
      setSelectedKey(null);
      setIsNew(false);
      await load();
    } catch (err) {
      setSaveError(errMsg(err, 'Error guardando el perfil'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(role: SecurityRole) {
    if (!confirm(`¿Eliminar el perfil "${role.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.deleteRole(role.key);
      setRoles((prev) => prev.filter((r) => r.key !== role.key));
      if (selectedKey === role.key) setSelectedKey(null);
    } catch (err) {
      alert(errMsg(err, 'Error eliminando el perfil'));
    }
  }

  const editing = isNew || selectedKey !== null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/users" className="p-2 text-gray-500 hover:text-[#003366] hover:bg-gray-100 rounded-lg transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Perfiles y Permisos</h1>
          <p className="text-gray-500 mt-1">Matriz de permisos por perfil — RBAC, sin permisos hardcodeados</p>
        </div>
      </div>

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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Roles list */}
          <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-fit">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 text-sm">Perfiles</h2>
              <button
                onClick={startNew}
                className="inline-flex items-center gap-1 text-xs text-[#003366] hover:underline font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> Nuevo
              </button>
            </div>
            <div className="divide-y divide-gray-100">
              {roles.map((role) => (
                <button
                  key={role.key}
                  onClick={() => startEdit(role)}
                  className={`w-full text-left px-4 py-3 transition hover:bg-gray-50 ${
                    selectedKey === role.key ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 text-sm flex items-center gap-1.5">
                      {role.isSystem && <Lock className="w-3 h-3 text-gray-400" />}
                      {role.name}
                    </span>
                    {!role.isActive && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">inactivo</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{role.permissions.length} permisos</p>
                </button>
              ))}
            </div>
          </div>

          {/* Editor */}
          <div className="lg:col-span-2">
            {!editing ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
                Selecciona un perfil para ver o editar su matriz de permisos, o crea uno nuevo.
              </div>
            ) : (
              <form onSubmit={handleSave} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
                {saveError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{saveError}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {isNew && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Clave *</label>
                      <input
                        type="text"
                        value={editForm.key}
                        onChange={(e) => setEditForm((f) => ({ ...f, key: e.target.value.trim().toLowerCase() }))}
                        placeholder="tenant.supervisor"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003366] focus:border-[#003366] outline-none transition font-mono text-sm"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003366] focus:border-[#003366] outline-none transition"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                    <input
                      type="text"
                      value={editForm.description}
                      onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003366] focus:border-[#003366] outline-none transition"
                    />
                  </div>
                  {!isNew && (
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={editForm.isActive}
                        onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))}
                      />
                      Perfil activo
                    </label>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Matriz de Permisos</h3>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left font-semibold text-gray-600">Módulo</th>
                            <th className="px-4 py-2 text-left font-semibold text-gray-600">Permisos</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {Array.from(permsByModule.entries()).map(([moduleKey, perms]) => {
                            const allChecked = perms.every((p) => editForm.permissions.includes(p.key));
                            return (
                              <tr key={moduleKey}>
                                <td className="px-4 py-3 align-top">
                                  <label className="inline-flex items-center gap-2 font-medium text-gray-900">
                                    <input
                                      type="checkbox"
                                      checked={allChecked}
                                      onChange={(e) => toggleModule(moduleKey, e.target.checked)}
                                    />
                                    {moduleLabel(moduleKey)}
                                  </label>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-wrap gap-3">
                                    {perms.map((p) => (
                                      <label key={p.key} className="inline-flex items-center gap-1.5 text-gray-700">
                                        <input
                                          type="checkbox"
                                          checked={editForm.permissions.includes(p.key)}
                                          onChange={() => togglePermission(p.key)}
                                        />
                                        {ACTION_LABELS[p.action] || p.action}
                                      </label>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div>
                    {!isNew && selectedKey && !roles.find((r) => r.key === selectedKey)?.isSystem && (
                      <button
                        type="button"
                        onClick={() => handleDelete(roles.find((r) => r.key === selectedKey)!)}
                        className="inline-flex items-center gap-2 text-red-600 hover:underline text-sm"
                      >
                        <Trash2 className="w-4 h-4" /> Eliminar perfil
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => { setSelectedKey(null); setIsNew(false); }}
                      className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-6 py-2.5 bg-[#003366] hover:bg-[#004080] text-white rounded-lg font-medium transition disabled:opacity-60 flex items-center gap-2"
                    >
                      {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                      Guardar Perfil
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
