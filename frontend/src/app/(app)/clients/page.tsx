'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Client } from '@/types';
import {
  Search,
  Loader2,
  AlertCircle,
  ArrowRight,
  Users,
  Trash2,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Plus,
} from 'lucide-react';

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadClients();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.clientId.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q),
    );
  }, [search, clients]);

  async function loadClients() {
    try {
      setLoading(true);
      setError('');
      const data = await api.getClients();
      setClients(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Error cargando clientes');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este cliente? Esta acción no se puede deshacer.')) return;
    try {
      setDeleting(id);
      await api.deleteClient(id);
      setClients((prev) => prev.filter((c) => c.id !== id));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      alert(msg || 'Error eliminando cliente');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500 mt-1">Directorio de clientes y crédito</p>
        </div>
        <Link
          href="/clients/new"
          className="inline-flex items-center gap-2 bg-[#003366] hover:bg-[#004080] text-white px-4 py-2.5 rounded-lg font-medium transition"
        >
          <Plus className="w-5 h-5" />
          Nuevo Cliente
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nombre, ID o correo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003366] focus:border-[#003366] outline-none transition"
        />
      </div>

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
              <button
                onClick={loadClients}
                className="mt-3 text-[#003366] hover:underline"
              >
                Reintentar
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
            {filtered.length ? (
              filtered.map((client) => (
                <ClientCard
                  key={client.id}
                  client={client}
                  onDelete={handleDelete}
                  deleting={deleting === client.id}
                />
              ))
            ) : (
              <div className="col-span-full py-12 text-center text-gray-400">
                {search.trim() ? 'No se encontraron resultados' : 'No hay clientes registrados'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ClientCard({
  client,
  onDelete,
  deleting,
}: {
  client: Client;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  // Values arrive as decimal strings from the API; coerce explicitly and
  // guard against a 0 credit limit (0/0 -> NaN previously painted a full red
  // "critical" bar for clients that simply have no limit set).
  const creditLimit = Number(client.creditLimit) || 0;
  const usedCredit = Number(client.usedCredit) || 0;
  const availableCredit = creditLimit - usedCredit;
  const usagePct = creditLimit > 0 ? Math.min(100, (usedCredit / creditLimit) * 100) : 0;
  const hasLimit = creditLimit > 0;
  const healthyCredit = hasLimit ? availableCredit / creditLimit > 0.3 : true;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#003366] rounded-full flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <Link
              href={`/clients/${client.id}`}
              className="font-semibold text-[#003366] hover:underline"
            >
              {client.name}
            </Link>
            <p className="text-xs text-gray-500">{client.clientId}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/clients/${client.id}`}
            className="p-2 text-[#003366] hover:bg-blue-50 rounded-lg transition"
            title="Ver detalle"
          >
            <ArrowRight className="w-4 h-4" />
          </Link>
          <button
            onClick={() => onDelete(client.id)}
            disabled={deleting}
            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
            title="Eliminar"
          >
            {deleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-gray-600">
          <Mail className="w-4 h-4 shrink-0" />
          <span className="truncate">{client.email}</span>
        </div>
        {client.phone && (
          <div className="flex items-center gap-2 text-gray-600">
            <Phone className="w-4 h-4 shrink-0" />
            <span>{client.phone}</span>
          </div>
        )}
        {client.address && (
          <div className="flex items-center gap-2 text-gray-600">
            <MapPin className="w-4 h-4 shrink-0" />
            <span className="truncate">{client.address}</span>
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 flex items-center gap-1">
            <CreditCard className="w-4 h-4" /> Crédito
          </span>
          <span className="font-semibold text-gray-900">
            {hasLimit
              ? `$${creditLimit.toLocaleString('es-CO')} COP`
              : 'Sin límite asignado'}
          </span>
        </div>
        <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${
              !hasLimit ? 'bg-gray-300' : healthyCredit ? 'bg-green-500' : 'bg-red-500'
            }`}
            style={{ width: `${usagePct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span className="text-gray-400">
            Usado: ${Number(client.usedCredit).toLocaleString('es-CO')} COP
          </span>
          <span className="text-gray-400">
            Disponible: ${Number(availableCredit).toLocaleString('es-CO')} COP
          </span>
        </div>
      </div>
    </div>
  );
}
