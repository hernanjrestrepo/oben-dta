'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { SecurityRole } from '@/types';
import { MENU, OPCIONES_MENU, PERMISOS_DEL_MENU, compartenPermiso, conNivel, nivelOpcion, type NivelAcceso, type OpcionMenu } from '@/lib/menu';
import { ArrowLeft, Plus, Loader2, AlertCircle, Trash2, Lock, GraduationCap } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import type { AjustesAcademy } from '@/types';

const NIVELES: Array<{ nivel: NivelAcceso; label: string; activo: string }> = [
  { nivel: 'ninguno', label: 'Sin acceso', activo: 'bg-gray-700 text-white border-gray-700' },
  { nivel: 'lectura', label: 'Solo lectura', activo: 'bg-blue-600 text-white border-blue-600' },
  { nivel: 'transaccional', label: 'Transaccional', activo: 'bg-[#F47735] text-white border-[#F47735]' },
];

/** Resumen del perfil para la lista: ¿puede hacer cambios en alguna opción del menú? */
function tipoPerfil(role: SecurityRole): { label: string; className: string } {
  const permisos = role.permissions.map((p) => p.key);
  const niveles = OPCIONES_MENU.map((o) => nivelOpcion(o, permisos));
  if (niveles.every((n) => n.nivel === 'ninguno')) return { label: 'Sin acceso', className: 'bg-gray-100 text-gray-600' };
  return niveles.some((n) => n.nivel === 'transaccional' || n.parcial)
    ? { label: 'Transaccional', className: 'bg-orange-100 text-[#C4521A]' }
    : { label: 'Solo lectura', className: 'bg-blue-50 text-blue-700' };
}

function opcionesVisibles(role: SecurityRole): number {
  const permisos = role.permissions.map((p) => p.key);
  return OPCIONES_MENU.filter((o) => nivelOpcion(o, permisos).nivel !== 'ninguno').length;
}

/** "Comercial Consulta" → "tenant.comercial-consulta" (la clave se arma sola). */
function claveDesdeNombre(nombre: string): string {
  const slug = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `tenant.${slug}` : '';
}

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

export default function AdminRolesPage() {
  const [roles, setRoles] = useState<SecurityRole[]>([]);
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
      setRoles(await api.getRoles());
    } catch (err) {
      setError(errMsg(err, 'Error cargando perfiles'));
    } finally {
      setLoading(false);
    }
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

  function setNivel(opcion: OpcionMenu, nivel: NivelAcceso) {
    setEditForm((f) => ({ ...f, permissions: conNivel(f.permissions, opcion, nivel) }));
  }

  function setNivelTodos(nivel: NivelAcceso) {
    setEditForm((f) => ({
      ...f,
      permissions: OPCIONES_MENU.reduce((acc, o) => conNivel(acc, o, nivel === 'transaccional' && o.operar.length === 0 ? 'lectura' : nivel), f.permissions),
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError('');
    if (isNew && (!editForm.key.trim() || !editForm.name.trim())) {
      setSaveError('El nombre del perfil es obligatorio');
      return;
    }
    if (OPCIONES_MENU.every((o) => nivelOpcion(o, editForm.permissions).nivel === 'ninguno')) {
      setSaveError('Dale acceso al menos a una opción del menú (Solo lectura o Transaccional).');
      return;
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
  const fueraDelMenu = editForm.permissions.filter((p) => !PERMISOS_DEL_MENU.has(p)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/users" className="p-2 text-gray-500 hover:text-[#F47735] hover:bg-gray-100 rounded-lg transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Perfiles</h1>
          <p className="text-gray-500 mt-1">Qué opciones del menú ve cada perfil y si solo consulta o también hace cambios.</p>
        </div>
      </div>

      <CertificacionAcademy />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-[#F47735] animate-spin" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-2" />
            <p className="text-red-600">{error}</p>
            <button onClick={load} className="mt-3 text-[#F47735] hover:underline">Reintentar</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Lista de perfiles */}
          <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-fit">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 text-sm">Perfiles</h2>
              <button onClick={startNew} className="inline-flex items-center gap-1 text-xs text-[#F47735] hover:underline font-medium">
                <Plus className="w-3.5 h-3.5" /> Nuevo
              </button>
            </div>
            <div className="divide-y divide-gray-100">
              {roles.map((role) => (
                <button
                  key={role.key}
                  onClick={() => startEdit(role)}
                  className={`w-full text-left px-4 py-3 transition hover:bg-gray-50 ${selectedKey === role.key ? 'bg-orange-50' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 text-sm flex items-center gap-1.5">
                      {role.isSystem && <Lock className="w-3 h-3 text-gray-400" />}
                      {role.name}
                    </span>
                    {!role.isActive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">inactivo</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${tipoPerfil(role).className}`}>{tipoPerfil(role).label}</span>
                    <span className="text-xs text-gray-500">
                      {opcionesVisibles(role)} de {OPCIONES_MENU.length} opciones del menú
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Editor */}
          <div className="lg:col-span-2">
            {!editing ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
                Selecciona un perfil para ver o cambiar su acceso, o crea uno nuevo.
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del perfil *</label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          name: e.target.value,
                          ...(isNew ? { key: claveDesdeNombre(e.target.value) } : {}),
                        }))
                      }
                      placeholder="Ej. Comercial consulta"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F47735] focus:border-[#F47735] outline-none transition"
                    />
                    {isNew && editForm.key && <p className="text-[11px] text-gray-500 mt-1 font-mono">Clave: {editForm.key}</p>}
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                    <input
                      type="text"
                      value={editForm.description}
                      onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F47735] focus:border-[#F47735] outline-none transition"
                    />
                  </div>
                  {!isNew && (
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))} />
                      Perfil activo
                    </label>
                  )}
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-gray-900">Acceso por opción del menú</h3>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500">Todo el menú:</span>
                      <button type="button" onClick={() => setNivelTodos('lectura')} className="px-2 py-1 rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">Solo lectura</button>
                      <button type="button" onClick={() => setNivelTodos('transaccional')} className="px-2 py-1 rounded border border-orange-200 bg-orange-50 text-[#C4521A] hover:bg-orange-100">Transaccional</button>
                      <button type="button" onClick={() => setNivelTodos('ninguno')} className="px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">Sin acceso</button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">
                    <b>Solo lectura</b>: ve la opción en el menú y consulta su información. <b>Transaccional</b>: además puede crear, editar, enviar, aprobar o
                    liquidar ahí. <b>Sin acceso</b>: la opción no le aparece en el menú.
                  </p>

                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="max-h-[520px] overflow-y-auto divide-y divide-gray-100">
                      {MENU.filter((grupo) => grupo.items.some((o) => OPCIONES_MENU.includes(o))).map((grupo) => (
                        <div key={grupo.titulo}>
                          <div className="sticky top-0 z-10 bg-gray-50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{grupo.titulo}</div>
                          {grupo.items.filter((o) => OPCIONES_MENU.includes(o)).map((opcion) => {
                            const { nivel, parcial } = nivelOpcion(opcion, editForm.permissions);
                            const Icon = opcion.icon;
                            const junto = compartenPermiso(opcion);
                            return (
                              <div key={opcion.href} className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 border-t border-gray-100 first:border-t-0">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                                    <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                                    {opcion.label}
                                    {parcial && <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">algunas acciones</span>}
                                  </div>
                                  {junto.length > 0 && (
                                    <p className="text-[11px] text-gray-400 mt-0.5 ml-6">Va junto con {junto.map((o) => o.label).join(', ')} (mismo permiso en el sistema)</p>
                                  )}
                                </div>
                                <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden shrink-0 self-start sm:self-auto">
                                  {NIVELES.map((n) => {
                                    const noAplica = n.nivel === 'transaccional' && opcion.operar.length === 0;
                                    return (
                                      <button
                                        key={n.nivel}
                                        type="button"
                                        disabled={noAplica}
                                        title={noAplica ? 'Esta opción solo se consulta: no tiene acciones de cambio' : undefined}
                                        aria-pressed={nivel === n.nivel}
                                        onClick={() => setNivel(opcion, n.nivel)}
                                        className={`px-3 py-1.5 text-xs font-medium border-l first:border-l-0 transition ${
                                          nivel === n.nivel ? n.activo : noAplica ? 'bg-white text-gray-300 cursor-not-allowed' : 'bg-white text-gray-600 hover:bg-gray-50'
                                        }`}
                                      >
                                        {n.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                  {fueraDelMenu > 0 && (
                    <p className="text-[11px] text-gray-400 mt-2">
                      Este perfil tiene además {fueraDelMenu} permiso(s) de funciones internas que no están en el menú (automatizaciones, inventario…); se conservan
                      tal cual.
                    </p>
                  )}
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
                      onClick={() => {
                        setSelectedKey(null);
                        setIsNew(false);
                      }}
                      className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-6 py-2.5 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg font-medium transition disabled:opacity-60 flex items-center gap-2"
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

/**
 * Xmart Academy (Hernán, 24-oct: "pon un botón en Perfiles para ver si exigimos o no la certificación"). Activa: lo
 * transaccional de cada opción se habilita solo al aprobar el quiz de su módulo. Consultar nunca se bloquea.
 */
function CertificacionAcademy() {
  const permisos = useAuthStore((s) => s.user?.permissions ?? []);
  const puedeEditar = permisos.includes('security.update');
  const [ajustes, setAjustes] = useState<AjustesAcademy | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.getAjustesAcademy().then(setAjustes).catch(() => setAjustes(null));
  }, []);

  if (!ajustes) return null;

  async function cambiar() {
    if (!ajustes) return;
    const exigir = !ajustes.exigirCertificacion;
    if (exigir && !window.confirm('Al exigir la certificación, quien no haya aprobado el quiz de un módulo podrá consultarlo pero no operar en él (crear, aprobar, liquidar, enviar) hasta aprobarlo. ¿Exigirla ahora?')) return;
    try {
      setGuardando(true);
      setMsg('');
      setAjustes(await api.guardarAjustesAcademy({ exigirCertificacion: exigir }));
      setMsg('Guardado: aplica en máximo 30 segundos.');
    } catch (e) {
      setMsg(errMsg(e, 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col md:flex-row md:items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <span className="w-10 h-10 rounded-lg bg-orange-50 text-[#F47735] flex items-center justify-center shrink-0">
        <GraduationCap className="w-5 h-5" />
      </span>
      <div className="flex-1">
        <p className="font-semibold text-gray-900">Certificación de Xmart Academy para operar</p>
        <p className="text-sm text-gray-500">
          {ajustes.exigirCertificacion
            ? `Exigida: lo transaccional se habilita al aprobar el quiz del módulo (mínimo ${ajustes.puntajeMinimo} %).`
            : 'No exigida: los perfiles transaccionales operan sin el quiz. Actívala cuando la gente haya completado su plan.'}{' '}
          <Link href="/academy/fricciones" className="text-[#C4521A] hover:underline">Ver avance de cada persona</Link>
        </p>
        {msg && <p className="text-xs text-gray-600 mt-1">{msg}</p>}
      </div>
      <button
        onClick={() => void cambiar()}
        disabled={!puedeEditar || guardando}
        title={puedeEditar ? undefined : 'Solo quien puede editar perfiles'}
        className="inline-flex items-center gap-3 disabled:opacity-50"
        aria-pressed={ajustes.exigirCertificacion}
      >
        <span className={`relative w-12 h-7 rounded-full transition ${ajustes.exigirCertificacion ? 'bg-[#F47735]' : 'bg-gray-300'}`}>
          <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${ajustes.exigirCertificacion ? 'left-6' : 'left-1'}`} />
        </span>
        <span className="text-sm font-semibold text-gray-800 w-20 text-left">{guardando ? 'Guardando…' : ajustes.exigirCertificacion ? 'Exigida' : 'No exigida'}</span>
      </button>
    </div>
  );
}
