'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type {
  DisparadorLista,
  DistributionList,
  DistributionRecipientRole,
  EnvioCatalogo,
  EnvioManualResultado,
  TenantUser,
} from '@/types';
import {
  AlertCircle,
  CheckCircle2,
  Hand,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Send,
  Trash2,
  UserRound,
  Users,
  X,
  Zap,
} from 'lucide-react';

const ROLE_LABEL: Record<DistributionRecipientRole, string> = { to: 'Para', cc: 'Copia', bcc: 'Copia oculta' };

interface RecipientDraft {
  email: string;
  name: string;
  role: DistributionRecipientRole;
}

function errMsg(err: unknown, fallback: string): string {
  const m = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(m) ? m.join(' · ') : m || fallback;
}

/**
 * Listas de distribución (WO-026): cada lista tiene dueños (pueden editarla
 * y dispararla), un disparador (automático o manual) y lo que envía,
 * escogido del catálogo de documentos y reportes de Oben Xmart.
 */
export default function DistribucionPage() {
  const { user } = useAuthStore();
  const esAdmin = !!user?.permissions?.includes('configuracion.update');
  const [lists, setLists] = useState<DistributionList[]>([]);
  const [catalogo, setCatalogo] = useState<EnvioCatalogo[]>([]);
  const [usuarios, setUsuarios] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  async function load() {
    try {
      setError('');
      setLists(await api.getDistributionLists());
    } catch (err) {
      setError(errMsg(err, 'No se pudieron cargar las listas de distribución.'));
    }
  }

  useEffect(() => {
    Promise.all([
      api.getDistributionLists().then(setLists),
      api.getEnviosCatalogo().then(setCatalogo),
      // Solo administración ve el directorio de usuarios (para asignar dueños).
      api.getTenantUsers().then(setUsuarios).catch(() => undefined),
    ])
      .catch((err) => setError(errMsg(err, 'No se pudieron cargar las listas de distribución.')))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-[#F47735]" />
            Listas de Distribución
          </h1>
          <p className="text-gray-500 mt-1 max-w-3xl">
            Quién recibe cada documento. Cada lista tiene <b>dueños</b> que la mantienen, un <b>disparador</b> (automático cuando
            el sistema genera el documento, o manual con &quot;Enviar ahora&quot;) y <b>lo que envía</b>.
          </p>
        </div>
        {esAdmin && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg font-medium transition"
          >
            <Plus className="w-4 h-4" /> Nueva lista
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {showForm && esAdmin && <NuevaLista onCreada={async () => { setShowForm(false); await load(); }} onCancelar={() => setShowForm(false)} />}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : lists.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          {esAdmin ? 'Todavía no hay listas de distribución creadas.' : 'No eres dueño de ninguna lista de distribución.'}
        </div>
      ) : (
        <div className="space-y-4">
          {lists.map((list) => (
            <ListaCard
              key={list.id}
              list={list}
              catalogo={catalogo}
              usuarios={usuarios}
              esAdmin={esAdmin}
              esDueno={!!user?.id && list.ownerUserIds?.includes(user.id)}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NuevaLista({ onCreada, onCancelar }: { onCreada: () => void; onCancelar: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function crear() {
    if (!name.trim()) return;
    try {
      setSaving(true);
      await api.createDistributionList({ name: name.trim(), description: description.trim() || undefined, recipients: [] });
      onCreada();
    } catch (err) {
      setError(errMsg(err, 'No se pudo crear la lista.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej: Lista de Empaque — COMEX)" className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Para qué se usa (opcional)" className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
      </div>
      <p className="text-xs text-gray-500">Después de crearla, agrega destinatarios, dueños y lo que envía.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancelar} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancelar</button>
        <button onClick={crear} disabled={saving || !name.trim()} className="inline-flex items-center gap-2 px-4 py-2 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg text-sm font-medium disabled:opacity-50">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Crear lista
        </button>
      </div>
    </div>
  );
}

function ListaCard({
  list,
  catalogo,
  usuarios,
  esAdmin,
  esDueno,
  onChanged,
}: {
  list: DistributionList;
  catalogo: EnvioCatalogo[];
  usuarios: TenantUser[];
  esAdmin: boolean;
  esDueno: boolean;
  onChanged: () => Promise<void>;
}) {
  const puedeGestionar = esAdmin || esDueno;
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const porClave = useMemo(() => new Map(catalogo.map((c) => [c.clave, c])), [catalogo]);
  const asociadas = list.associations.filter((a) => a.entityType === 'document');
  const disponibles = catalogo.filter((c) => !asociadas.some((a) => a.entityKey === c.clave));
  const enviables = asociadas.map((a) => porClave.get(a.entityKey)).filter((c): c is EnvioCatalogo => !!c?.manual);

  async function accion(fn: () => Promise<unknown>, fallo: string) {
    try {
      setOcupado(true);
      setError('');
      await fn();
      await onChanged();
    } catch (err) {
      setError(errMsg(err, fallo));
    } finally {
      setOcupado(false);
    }
  }

  const nombreUsuario = (id: string) => {
    const u = usuarios.find((x) => x.id === id);
    return u ? `${u.firstName} ${u.lastName}`.trim() || u.email : 'Usuario';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            {list.name}
            {esDueno && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-100 text-[#C4521A]">Eres dueño</span>}
          </h3>
          {list.description && <p className="text-sm text-gray-500">{list.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Disparador
            valor={list.disparador ?? 'automatico'}
            editable={esAdmin}
            onCambiar={(d) => accion(() => api.updateDistributionList(list.id, { disparador: d }), 'No se pudo cambiar el disparador.')}
          />
          {esAdmin && (
            <button
              onClick={() => confirm(`¿Eliminar la lista "${list.name}"?`) && accion(() => api.deleteDistributionList(list.id), 'No se pudo eliminar la lista.')}
              className="text-gray-400 hover:text-red-500 p-1.5"
              title="Eliminar lista"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Dueños */}
        <Seccion titulo="Dueños" ayuda="Mantienen la lista y pueden enviar a mano.">
          <div className="flex flex-wrap gap-1.5">
            {(list.ownerUserIds ?? []).length === 0 && <span className="text-xs text-gray-400">Sin dueño: solo administración la gestiona.</span>}
            {(list.ownerUserIds ?? []).map((id) => (
              <span key={id} className="inline-flex items-center gap-1 text-xs bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1 text-gray-700">
                <UserRound className="w-3 h-3 text-gray-400" />
                {nombreUsuario(id)}
                {esAdmin && (
                  <button
                    onClick={() => accion(() => api.updateDistributionList(list.id, { ownerUserIds: list.ownerUserIds.filter((x) => x !== id) }), 'No se pudo quitar el dueño.')}
                    className="hover:text-red-600"
                    title="Quitar dueño"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
          {esAdmin && usuarios.length > 0 && (
            <select
              value=""
              disabled={ocupado}
              onChange={(e) =>
                e.target.value && accion(() => api.updateDistributionList(list.id, { ownerUserIds: [...(list.ownerUserIds ?? []), e.target.value] }), 'No se pudo agregar el dueño.')
              }
              className="mt-2 w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs"
            >
              <option value="">+ Agregar dueño…</option>
              {usuarios
                .filter((u) => u.isActive && !(list.ownerUserIds ?? []).includes(u.id))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {`${u.firstName} ${u.lastName}`.trim()} · {u.email}
                  </option>
                ))}
            </select>
          )}
        </Seccion>

        {/* Qué envía */}
        <Seccion titulo="Qué envía" ayuda="Documentos y reportes que reciben los destinatarios.">
          <div className="flex flex-wrap gap-1.5">
            {asociadas.length === 0 && <span className="text-xs text-gray-400">Nada todavía.</span>}
            {asociadas.map((a) => {
              const c = porClave.get(a.entityKey);
              return (
                <span key={a.id} title={c?.descripcion} className="inline-flex items-center gap-1.5 text-xs bg-[#FFF1E8] text-[#B34E14] rounded-full px-2.5 py-1">
                  {c?.label ?? a.entityKey}
                  {esAdmin && (
                    <button onClick={() => accion(() => api.dissociateDistributionList(list.id, a.id), 'No se pudo quitar.')} className="hover:text-red-600" title="Quitar">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              );
            })}
          </div>
          {esAdmin && disponibles.length > 0 && (
            <select
              value=""
              disabled={ocupado}
              onChange={(e) => e.target.value && accion(() => api.associateDistributionList(list.id, 'document', e.target.value), 'No se pudo agregar.')}
              className="mt-2 w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs"
            >
              <option value="">+ Agregar documento o reporte…</option>
              {[...new Set(disponibles.map((d) => d.grupo))].map((g) => (
                <optgroup key={g} label={g}>
                  {disponibles
                    .filter((d) => d.grupo === g)
                    .map((d) => (
                      <option key={d.clave} value={d.clave}>
                        {d.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          )}
        </Seccion>

        {/* Enviar ahora */}
        <Seccion titulo="Enviar ahora" ayuda="Envía un documento de una orden solo a esta lista.">
          {!puedeGestionar ? (
            <span className="text-xs text-gray-400">Solo los dueños o administración.</span>
          ) : enviables.length === 0 ? (
            <span className="text-xs text-gray-400">Esta lista no tiene documentos que se envíen a mano.</span>
          ) : (
            <EnviarAhora lista={list} enviables={enviables} />
          )}
        </Seccion>
      </div>

      {/* Destinatarios */}
      <Destinatarios list={list} editable={puedeGestionar} onGuardado={onChanged} />

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-600">{titulo}</p>
      <p className="text-[11px] text-gray-500 mb-2">{ayuda}</p>
      {children}
    </div>
  );
}

function Disparador({ valor, editable, onCambiar }: { valor: DisparadorLista; editable: boolean; onCambiar: (d: DisparadorLista) => void }) {
  const opciones: Array<{ v: DisparadorLista; label: string; icon: typeof Zap; title: string }> = [
    { v: 'automatico', label: 'Automático', icon: Zap, title: 'Recibe cuando el sistema genera el documento' },
    { v: 'manual', label: 'Manual', icon: Hand, title: 'Solo recibe cuando alguien presiona "Enviar ahora"' },
  ];
  return (
    <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
      {opciones.map(({ v, label, icon: Icon, title }) => {
        const activo = valor === v;
        return (
          <button
            key={v}
            title={title}
            disabled={!editable || activo}
            onClick={() => onCambiar(v)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition ${
              activo ? 'bg-white shadow-sm text-[#C4521A]' : 'text-gray-500 hover:text-gray-800 disabled:hover:text-gray-500'
            } ${!editable && !activo ? 'opacity-50' : ''}`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        );
      })}
    </div>
  );
}

function EnviarAhora({ lista, enviables }: { lista: DistributionList; enviables: EnvioCatalogo[] }) {
  const [clave, setClave] = useState(enviables[0]?.clave ?? '');
  const [ov, setOv] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<EnvioManualResultado | null>(null);
  const [error, setError] = useState('');
  const n = Number(ov);
  const valido = Number.isInteger(n) && n > 0 && !!clave;

  async function enviar() {
    const doc = enviables.find((e) => e.clave === clave)?.label ?? clave;
    const total = lista.recipients.length;
    if (!confirm(`Se enviará "${doc}" de la OV ${n} a los ${total} destinatarios de "${lista.name}". ¿Continuar?`)) return;
    try {
      setEnviando(true);
      setError('');
      setResultado(await api.enviarDistributionList(lista.id, clave, n));
    } catch (err) {
      setError(errMsg(err, 'No se pudo enviar.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-2">
      <select value={clave} onChange={(e) => setClave(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs">
        {enviables.map((e) => (
          <option key={e.clave} value={e.clave}>
            {e.label}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <input
          value={ov}
          onChange={(e) => setOv(e.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          placeholder="N.º de OV"
          className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded-lg text-xs"
        />
        <button
          onClick={enviar}
          disabled={!valido || enviando}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg text-xs font-medium disabled:opacity-50"
        >
          {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Enviar
        </button>
      </div>
      {resultado && (
        <p className="text-xs text-emerald-700 flex items-start gap-1">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" />
          Enviado: {resultado.documento} de la OV {resultado.ov} ({resultado.adjuntos.length} adjunto{resultado.adjuntos.length === 1 ? '' : 's'}).
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function Destinatarios({ list, editable, onGuardado }: { list: DistributionList; editable: boolean; onGuardado: () => Promise<void> }) {
  const [editando, setEditando] = useState(false);
  const [filas, setFilas] = useState<RecipientDraft[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  function empezar() {
    setFilas(list.recipients.map((r) => ({ email: r.email, name: r.name ?? '', role: r.role })));
    setEditando(true);
    setError('');
  }

  async function guardar() {
    const validas = filas.filter((r) => r.email.trim());
    try {
      setGuardando(true);
      await api.updateDistributionRecipients(
        list.id,
        validas.map((r) => ({ email: r.email.trim(), name: r.name.trim() || undefined, role: r.role })),
      );
      setEditando(false);
      await onGuardado();
    } catch (err) {
      setError(errMsg(err, 'No se pudieron guardar los destinatarios.'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-600">
          Destinatarios <span className="font-normal normal-case text-gray-400">({list.recipients.length})</span>
        </p>
        {editable && !editando && (
          <button onClick={empezar} className="inline-flex items-center gap-1 text-xs font-medium text-[#C4521A] hover:underline">
            <Pencil className="w-3.5 h-3.5" /> Editar
          </button>
        )}
      </div>
      {!editando ? (
        <div className="flex flex-wrap gap-1.5">
          {list.recipients.length === 0 && <span className="text-xs text-gray-400">Sin destinatarios.</span>}
          {list.recipients.map((r) => (
            <span key={r.id} className="inline-flex items-center gap-1 text-xs bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1 text-gray-700">
              <Mail className="w-3 h-3 text-gray-400" />
              {r.email}
              {r.role !== 'to' && <span className="text-gray-400">· {ROLE_LABEL[r.role]}</span>}
            </span>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filas.map((r, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                value={r.email}
                onChange={(e) => setFilas((f) => f.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))}
                placeholder="correo@ejemplo.com"
                className="flex-1 min-w-0 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
              />
              <select
                value={r.role}
                onChange={(e) => setFilas((f) => f.map((x, j) => (j === i ? { ...x, role: e.target.value as DistributionRecipientRole } : x)))}
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
              >
                <option value="to">Para</option>
                <option value="cc">Copia</option>
                <option value="bcc">Copia oculta</option>
              </select>
              <button onClick={() => setFilas((f) => f.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 p-1.5" title="Quitar">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button onClick={() => setFilas((f) => [...f, { email: '', name: '', role: 'to' }])} className="text-sm text-[#F47735] hover:text-[#E5641F] font-medium">
              + Agregar destinatario
            </button>
            <div className="flex gap-2">
              <button onClick={() => setEditando(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Cancelar</button>
              <button onClick={guardar} disabled={guardando} className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
