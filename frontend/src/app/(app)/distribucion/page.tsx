'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DistributionList, DistributionEntityType, DistributionRecipientRole } from '@/types';
import { Users, Plus, Trash2, Mail, Link2, Loader2, AlertCircle, X } from 'lucide-react';

const ROLE_LABEL: Record<DistributionRecipientRole, string> = { to: 'Para', cc: 'Copia', bcc: 'Copia oculta' };
const ENTITY_TYPE_LABEL: Record<DistributionEntityType, string> = {
  document: 'Documento',
  transaction: 'Transacción',
  report: 'Reporte',
};

interface RecipientDraft {
  email: string;
  name: string;
  role: DistributionRecipientRole;
}

export default function DistribucionPage() {
  const [lists, setLists] = useState<DistributionList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [recipients, setRecipients] = useState<RecipientDraft[]>([{ email: '', name: '', role: 'to' }]);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setError('');
      const data = await api.getDistributionLists();
      setLists(data);
    } catch {
      setError('No se pudieron cargar las listas de distribución.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function updateRecipient(i: number, patch: Partial<RecipientDraft>) {
    setRecipients((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addRecipientRow() {
    setRecipients((prev) => [...prev, { email: '', name: '', role: 'to' }]);
  }

  function removeRecipientRow(i: number) {
    setRecipients((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleCreate() {
    const valid = recipients.filter((r) => r.email.trim());
    if (!name.trim() || valid.length === 0) return;
    try {
      setSaving(true);
      await api.createDistributionList({
        name: name.trim(),
        description: description.trim() || undefined,
        recipients: valid.map((r) => ({ email: r.email.trim(), name: r.name.trim() || undefined, role: r.role })),
      });
      setName('');
      setDescription('');
      setRecipients([{ email: '', name: '', role: 'to' }]);
      setShowForm(false);
      await load();
    } catch {
      setError('No se pudo crear la lista.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await api.deleteDistributionList(id);
    await load();
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-[#F47735]" />
            Listas de Distribución
          </h1>
          <p className="text-gray-500 mt-1">
            Grupos de correos (Para/Copia) reutilizables, asociables a un tipo de documento, transacción o reporte — para que el sistema sepa a quién enviar sin escribir el correo cada vez.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg font-medium transition"
        >
          <Plus className="w-4 h-4" /> Nueva lista
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Distribución Lista de Empaque"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F47735] focus:border-[#F47735] outline-none text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción (opcional)</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Para qué se usa esta lista"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F47735] focus:border-[#F47735] outline-none text-gray-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Destinatarios</label>
            <div className="space-y-2">
              {recipients.map((r, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    value={r.email}
                    onChange={(e) => updateRecipient(i, { email: e.target.value })}
                    placeholder="correo@ejemplo.com"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                  />
                  <input
                    value={r.name}
                    onChange={(e) => updateRecipient(i, { name: e.target.value })}
                    placeholder="Nombre (opcional)"
                    className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                  />
                  <select
                    value={r.role}
                    onChange={(e) => updateRecipient(i, { role: e.target.value as DistributionRecipientRole })}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                  >
                    <option value="to">Para</option>
                    <option value="cc">Copia</option>
                    <option value="bcc">Copia oculta</option>
                  </select>
                  {recipients.length > 1 && (
                    <button onClick={() => removeRecipientRow(i)} className="text-gray-400 hover:text-red-500 p-2">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addRecipientRow} className="mt-2 text-sm text-[#F47735] hover:text-[#E5641F] font-medium">
              + Agregar destinatario
            </button>
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm font-medium">
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || !name.trim() || !recipients.some((r) => r.email.trim())}
              className="inline-flex items-center gap-2 px-5 py-2 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg font-medium transition disabled:opacity-50 text-sm"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Guardar lista
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : lists.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">Todavía no hay listas de distribución creadas.</div>
      ) : (
        <div className="space-y-4">
          {lists.map((list) => (
            <ListCard key={list.id} list={list} onChanged={load} onDelete={() => handleDelete(list.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ListCard({ list, onChanged, onDelete }: { list: DistributionList; onChanged: () => void; onDelete: () => void }) {
  const [entityType, setEntityType] = useState<DistributionEntityType>('document');
  const [entityKey, setEntityKey] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleAssociate() {
    if (!entityKey.trim()) return;
    try {
      setSaving(true);
      await api.associateDistributionList(list.id, entityType, entityKey.trim());
      setEntityKey('');
      await onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function handleDissociate(associationId: string) {
    await api.dissociateDistributionList(list.id, associationId);
    await onChanged();
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">{list.name}</h3>
          {list.description && <p className="text-sm text-gray-500">{list.description}</p>}
        </div>
        <button onClick={onDelete} className="text-gray-400 hover:text-red-500 p-1.5">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {list.recipients.map((r) => (
          <span key={r.id} className="inline-flex items-center gap-1 text-xs bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1 text-gray-700">
            <Mail className="w-3 h-3 text-gray-400" />
            {r.email}
            <span className="text-gray-400">· {ROLE_LABEL[r.role]}</span>
          </span>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-xs font-medium text-gray-500 uppercase mb-2 flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5" /> Asociada a
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {list.associations.length === 0 && <span className="text-xs text-gray-400">Sin asociaciones todavía.</span>}
          {list.associations.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1.5 text-xs bg-[#FFF1E8] text-[#B34E14] rounded-full px-2.5 py-1">
              {ENTITY_TYPE_LABEL[a.entityType]}: {a.entityKey}
              <button onClick={() => handleDissociate(a.id)} className="hover:text-red-600">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as DistributionEntityType)}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-900"
          >
            <option value="document">Documento</option>
            <option value="transaction">Transacción</option>
            <option value="report">Reporte</option>
          </select>
          <input
            value={entityKey}
            onChange={(e) => setEntityKey(e.target.value)}
            placeholder="ej: packing_list, invoice"
            className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-900"
          />
          <button
            onClick={handleAssociate}
            disabled={saving || !entityKey.trim()}
            className="px-3 py-1.5 bg-gray-900 hover:bg-black text-white rounded-lg text-xs font-medium disabled:opacity-50"
          >
            Asociar
          </button>
        </div>
      </div>
    </div>
  );
}
