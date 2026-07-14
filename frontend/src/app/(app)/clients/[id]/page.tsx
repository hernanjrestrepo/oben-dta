'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Client } from '@/types';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  ShoppingCart,
  Calendar,
  RefreshCw,
  Pencil,
} from 'lucide-react';

export default function ClientDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', creditLimit: '' });

  useEffect(() => {
    if (id) loadClient();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadClient() {
    try {
      setLoading(true);
      setError('');
      const data = await api.getClient(id);
      setClient(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Error cargando cliente');
    } finally {
      setLoading(false);
    }
  }

  function startEditing() {
    if (!client) return;
    setForm({
      name: client.name,
      email: client.email,
      phone: client.phone || '',
      address: client.address || '',
      creditLimit: String(client.creditLimit ?? ''),
    });
    setSaveError('');
    setEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return;
    setSaveError('');
    if (!form.name.trim() || form.name.trim().length < 2) {
      setSaveError('Ingresa un nombre válido');
      return;
    }
    if (!form.email.trim()) {
      setSaveError('Ingresa un correo válido');
      return;
    }
    try {
      setSaving(true);
      const updated = await api.updateClient(client.id, {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        creditLimit: form.creditLimit ? Number(form.creditLimit) : undefined,
      });
      setClient(updated);
      setEditing(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setSaveError(msg || 'Error guardando cambios');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-[#003366] animate-spin" />
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <p className="text-red-600 font-medium">{error || 'Cliente no encontrado'}</p>
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={loadClient}
              className="text-[#003366] hover:underline"
            >
              Reintentar
            </button>
            <Link href="/clients" className="text-gray-500 hover:underline">
              Volver a clientes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const availableCredit = client.creditLimit - client.usedCredit;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/clients"
            className="p-2 text-gray-500 hover:text-[#003366] hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
            <p className="text-gray-500 text-sm">{client.clientId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadClient}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
          >
            <RefreshCw className="w-4 h-4" />
            Actualizar
          </button>
          <button
            onClick={startEditing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#003366] hover:bg-[#004080] text-white rounded-lg font-medium transition"
          >
            <Pencil className="w-4 h-4" />
            Editar
          </button>
        </div>
      </div>

      {editing && (
        <form
          onSubmit={handleSave}
          className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 space-y-4"
        >
          <h2 className="text-lg font-semibold text-gray-900">Editar Cliente</h2>

          {saveError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{saveError}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003366] focus:border-[#003366] outline-none transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Límite de Crédito (COP)</label>
              <input
                type="number"
                min={0}
                value={form.creditLimit}
                onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003366] focus:border-[#003366] outline-none transition"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
            <textarea
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              rows={2}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003366] focus:border-[#003366] outline-none transition resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-[#003366] hover:bg-[#004080] text-white rounded-lg font-medium transition flex items-center gap-2 disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar Cambios'
              )}
            </button>
          </div>
        </form>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Información de Contacto</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-[#003366] mt-0.5" />
              <div>
                <p className="text-xs text-gray-500">Correo electrónico</p>
                <p className="text-gray-900">{client.email}</p>
              </div>
            </div>
            {client.phone && (
              <div className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-[#003366] mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500">Teléfono</p>
                  <p className="text-gray-900">{client.phone}</p>
                </div>
              </div>
            )}
            {client.address && (
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-[#003366] mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500">Dirección</p>
                  <p className="text-gray-900">{client.address}</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-[#003366] mt-0.5" />
              <div>
                <p className="text-xs text-gray-500">Registrado</p>
                <p className="text-gray-900">
                  {new Date(client.createdAt).toLocaleDateString('es-CO')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[#003366]" />
            Información de Crédito
          </h2>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-500">Límite de Crédito</p>
              <p className="text-xl font-bold text-[#003366]">
                ${Number(client.creditLimit).toLocaleString('es-CO')} COP
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Crédito Usado</p>
              <p className="text-lg font-semibold text-gray-900">
                ${Number(client.usedCredit).toLocaleString('es-CO')} COP
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Disponible</p>
              <p
                className={`text-lg font-semibold ${
                  availableCredit > 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                ${Number(availableCredit).toLocaleString('es-CO')} COP
              </p>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  availableCredit / client.creditLimit > 0.3
                    ? 'bg-green-500'
                    : availableCredit / client.creditLimit > 0.1
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}
                style={{
                  width: `${Math.min(100, (client.usedCredit / client.creditLimit) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Orders */}
      {client.orders && client.orders.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-[#003366]" />
              Órdenes del Cliente
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Orden</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Total</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Estado</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {client.orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link
                        href={`/orders/${order.id}`}
                        className="font-medium text-[#003366] hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      ${Number(order.totalAmount).toLocaleString('es-CO')} COP
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {new Date(order.createdAt).toLocaleDateString('es-CO')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
