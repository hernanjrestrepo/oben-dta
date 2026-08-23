'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Client, Product } from '@/types';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Package,
  ChevronDown,
} from 'lucide-react';

export default function NewOrderPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [clientId, setClientId] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<{ productId: string; quantity: number }[]>([
    { productId: '', quantity: 1 },
  ]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [clientsRes, productsRes] = await Promise.all([
        api.getClients(),
        api.getProducts(),
      ]);
      setClients(clientsRes);
      setProducts(productsRes);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }

  function addItem() {
    setItems((prev) => [...prev, { productId: '', quantity: 1 }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: 'productId' | 'quantity', value: string | number) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  }

  function getTotal(): number {
    return items.reduce((sum, item) => {
      const product = products.find((p) => p.id === item.productId);
      return sum + (product ? product.price * item.quantity : 0);
    }, 0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!clientId) {
      setError('Selecciona un cliente');
      return;
    }
    if (!orderNumber.trim()) {
      setError('Ingresa un número de orden');
      return;
    }
    const validItems = items.filter((i) => i.productId && i.quantity > 0);
    if (validItems.length === 0) {
      setError('Agrega al menos un producto');
      return;
    }

    try {
      setSubmitting(true);
      await api.createOrder({
        clientId,
        orderNumber: orderNumber.trim(),
        notes: notes.trim() || undefined,
        items: validItems,
      });
      router.push('/orders');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Error creando la orden');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-[#F47735] animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/orders"
          className="p-2 text-gray-500 hover:text-[#F47735] hover:bg-gray-100 rounded-lg transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nueva Orden</h1>
          <p className="text-gray-500 text-sm">Crea una orden de exportación</p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Order Info */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Información General</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Número de Orden *</label>
              <input
                type="text"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="ORD-2026-0001"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F47735] focus:border-[#F47735] outline-none transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
              <div className="relative">
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F47735] focus:border-[#F47735] outline-none transition appearance-none bg-white"
                >
                  <option value="">Seleccionar cliente...</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name} ({client.clientId})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas adicionales sobre la orden..."
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F47735] focus:border-[#F47735] outline-none transition resize-none"
            />
          </div>
        </div>

        {/* Items */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Package className="w-5 h-5 text-[#F47735]" />
              Productos
            </h2>
            <button
              type="button"
              onClick={addItem}
              className="inline-flex items-center gap-1 text-sm text-[#F47735] hover:underline"
            >
              <Plus className="w-4 h-4" />
              Agregar
            </button>
          </div>

          {items.map((item, index) => {
            const product = products.find((p) => p.id === item.productId);
            return (
              <div key={index} className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="relative">
                    <select
                      value={item.productId}
                      onChange={(e) => updateItem(index, 'productId', e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F47735] focus:border-[#F47735] outline-none transition appearance-none bg-white"
                    >
                      <option value="">Seleccionar producto...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — ${p.price.toLocaleString('es-CO')} COP
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div className="w-28">
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F47735] focus:border-[#F47735] outline-none transition"
                  />
                </div>
                <div className="w-32 text-right py-2.5 text-sm font-medium text-gray-700">
                  {product
                    ? `$${(product.price * item.quantity).toLocaleString('es-CO')} COP`
                    : '—'}
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  disabled={items.length === 1}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-30"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}

          <div className="flex justify-end pt-2 border-t border-gray-100">
            <p className="text-lg font-bold text-[#F47735]">
              Total: ${getTotal().toLocaleString('es-CO')} COP
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Link
            href="/orders"
            className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg font-medium transition flex items-center gap-2 disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Creando...
              </>
            ) : (
              'Crear Orden'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
