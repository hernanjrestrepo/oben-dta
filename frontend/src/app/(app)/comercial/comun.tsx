'use client';

import type { CasoEstado } from '@/types';

export const ESTADOS: CasoEstado[] = ['oc_recibida', 'sin_cubicar', 'cubicada', 'enviada_cliente', 'retenida', 'activa', 'cerrada', 'rechazada', 'anulada'];

export const ESTADO_LABEL: Record<CasoEstado, string> = {
  oc_recibida: 'OC recibida',
  sin_cubicar: 'Sin cubicar',
  cubicada: 'Cubicada',
  enviada_cliente: 'Enviada al cliente',
  retenida: 'OV retenida (cartera)',
  activa: 'OV activa',
  cerrada: 'Cerrada (despachada)',
  rechazada: 'Rechazada',
  anulada: 'Anulada',
};

const ESTADO_COLOR: Record<CasoEstado, string> = {
  oc_recibida: 'bg-gray-100 text-gray-700',
  sin_cubicar: 'bg-blue-50 text-blue-700',
  cubicada: 'bg-indigo-50 text-indigo-700',
  enviada_cliente: 'bg-amber-50 text-amber-700',
  retenida: 'bg-orange-50 text-orange-700',
  activa: 'bg-green-50 text-green-700',
  cerrada: 'bg-emerald-100 text-emerald-800',
  rechazada: 'bg-red-50 text-red-700',
  anulada: 'bg-gray-200 text-gray-600',
};

export const ACCION_LABEL: Record<string, string> = {
  crear_proforma: 'Crear la Proforma en OBEN MAS',
  aprobar: 'Pasar a orden de venta retenida (el cliente aprobó)',
  rechazar: 'Anular la Proforma (el cliente rechazó)',
  modificar: 'Modificar la Proforma (vuelve a "sin cubicar")',
  activar: 'Activar la orden de venta (cartera liberó)',
};

export function EstadoBadge({ estado }: { estado: CasoEstado }) {
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLOR[estado]}`}>{ESTADO_LABEL[estado]}</span>;
}

export function SimuladoBadge({ items }: { items?: string[] }) {
  return (
    <span title={items?.join('\n')} className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
      SIMULADO
    </span>
  );
}

export const inputCls =
  'px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F47735] focus:border-[#F47735] outline-none text-gray-900 text-sm';
export const btnPrimary =
  'inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg text-sm font-medium disabled:opacity-50';
export const btnSecondary =
  'inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium disabled:opacity-50';

export function fecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}
