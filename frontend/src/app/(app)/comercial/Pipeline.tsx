'use client';

import type { CasoEstado, ComercialCaso } from '@/types';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Hourglass, Inbox, Timer } from 'lucide-react';
import { SimuladoBadge } from './comun';

/** Etapas del embudo, en orden, con la fecha que marca la entrada a cada una. */
const ETAPAS: Array<{ estado: CasoEstado; titulo: string; quien: string; desde: (c: ComercialCaso) => string | undefined }> = [
  { estado: 'oc_recibida', titulo: 'OC recibida', quien: 'Comercial confirma', desde: (c) => c.fechas.ocRecibida ?? c.ocRecibidaEn },
  { estado: 'sin_cubicar', titulo: 'Proforma sin cubicar', quien: 'Planeación', desde: (c) => c.fechas.proformaCreada },
  { estado: 'cubicada', titulo: 'Cubicada', quien: 'Comercial envía', desde: (c) => c.fechas.cubicada },
  { estado: 'enviada_cliente', titulo: 'Esperando al cliente', quien: 'Cliente aprueba', desde: (c) => c.fechas.enviadaCliente },
  { estado: 'retenida', titulo: 'Retenida en cartera', quien: 'Cartera libera', desde: (c) => c.fechas.retenida },
  { estado: 'activa', titulo: 'OV activa', quien: 'Producción', desde: (c) => c.fechas.activa },
];

/** Días hábiles de alerta por etapa: más de esto en la misma etapa = demorada. */
const ALERTA_DIAS: Partial<Record<CasoEstado, number>> = { oc_recibida: 1, sin_cubicar: 2, cubicada: 1, enviada_cliente: 3, retenida: 2 };

const DIA = 86_400_000;
const dias = (desde?: string | null) => (desde ? Math.max(0, (Date.now() - new Date(desde).getTime()) / DIA) : null);
const fmtDias = (d: number | null) => (d === null ? '—' : d < 1 ? `${Math.max(1, Math.round(d * 24))} h` : `${Math.floor(d)} d`);
const kilos = (c: ComercialCaso) => c.lineas.reduce((a, l) => a + (l.kilos ?? 0), 0);
const fmtKg = (n: number) => `${Math.round(n).toLocaleString('es-CO')} kg`;
const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function semaforo(c: ComercialCaso, d: number | null): 'verde' | 'ambar' | 'rojo' {
  const limite = ALERTA_DIAS[c.estado];
  if (d === null || limite === undefined) return 'verde';
  if (d > limite * 2) return 'rojo';
  if (d > limite) return 'ambar';
  return 'verde';
}

const COLOR = {
  verde: 'border-l-emerald-500',
  ambar: 'border-l-amber-500',
  rojo: 'border-l-red-500',
};
const TEXTO = { verde: 'text-emerald-700', ambar: 'text-amber-700', rojo: 'text-red-700' };

/**
 * Tablero tipo CRM del flujo Comercial: dónde está cada orden de compra, cuánto lleva en esa etapa (semáforo),
 * qué espera y de quién, más los indicadores del embudo. Usa los mismos casos (y filtros) de la pantalla.
 */
export function Pipeline({ casos, onAbrir }: { casos: ComercialCaso[]; onAbrir: (id: string) => void }) {
  const abiertos = casos.filter((c) => !['activa', 'cerrada', 'rechazada', 'anulada'].includes(c.estado));
  const conDias = casos.map((c) => {
    const etapa = ETAPAS.find((e) => e.estado === c.estado);
    const d = dias(etapa?.desde(c) ?? c.ocRecibidaEn);
    return { c, d, luz: semaforo(c, d) };
  });
  const demoradas = conDias.filter((x) => abiertos.includes(x.c) && x.luz !== 'verde');
  const hoy = new Date().toISOString().slice(0, 10);
  const vencidas = abiertos.filter((c) => c.fechaRequerida && c.fechaRequerida < hoy);
  const ciclo = promedio(casos.filter((c) => c.fechas.activa).map((c) => (new Date(c.fechas.activa!).getTime() - new Date(c.ocRecibidaEn).getTime()) / DIA));
  const aprobacion = promedio(casos.filter((c) => c.fechas.enviadaCliente && c.fechas.aprobadaCliente).map((c) => (new Date(c.fechas.aprobadaCliente!).getTime() - new Date(c.fechas.enviadaCliente!).getTime()) / DIA));
  const perdidas = casos.filter((c) => c.estado === 'rechazada' || c.estado === 'anulada').length;
  const ganadas = casos.filter((c) => ['activa', 'cerrada'].includes(c.estado)).length;
  const conversion = ganadas + perdidas > 0 ? Math.round((ganadas / (ganadas + perdidas)) * 100) : null;
  const kgAbiertos = abiertos.reduce((a, c) => a + kilos(c), 0);
  const esperandoConfirmacion = abiertos.filter((c) => c.accionPendiente).length;

  const kpis: Array<{ icon: React.ReactNode; label: string; valor: string; nota?: string; alerta?: boolean }> = [
    { icon: <Inbox className="w-4 h-4" />, label: 'Órdenes en curso', valor: String(abiertos.length), nota: fmtKg(kgAbiertos) },
    { icon: <Hourglass className="w-4 h-4" />, label: 'Esperan una persona', valor: String(esperandoConfirmacion), nota: 'acción por confirmar', alerta: esperandoConfirmacion > 0 },
    { icon: <AlertTriangle className="w-4 h-4" />, label: 'Demoradas', valor: String(demoradas.length), nota: 'más tiempo del normal en su etapa', alerta: demoradas.length > 0 },
    { icon: <CalendarClock className="w-4 h-4" />, label: 'Fecha requerida vencida', valor: String(vencidas.length), nota: 'el cliente ya las esperaba', alerta: vencidas.length > 0 },
    { icon: <Timer className="w-4 h-4" />, label: 'OC → OV activa', valor: ciclo === null ? '—' : fmtDias(ciclo), nota: 'promedio' },
    { icon: <Clock className="w-4 h-4" />, label: 'Respuesta del cliente', valor: aprobacion === null ? '—' : fmtDias(aprobacion), nota: 'promedio' },
    { icon: <CheckCircle2 className="w-4 h-4" />, label: 'Conversión', valor: conversion === null ? '—' : `${conversion} %`, nota: `${ganadas} activas · ${perdidas} perdidas` },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className={`rounded-xl border p-3 ${k.alerta ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              {k.icon}
              {k.label}
            </div>
            <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{k.valor}</p>
            {k.nota && <p className="text-[11px] text-gray-500">{k.nota}</p>}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="font-medium text-gray-700">Tiempo en la etapa:</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500" /> normal</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-500" /> demorada</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500" /> muy demorada</span>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="grid grid-flow-col auto-cols-[minmax(220px,1fr)] gap-3 min-w-max xl:min-w-0">
          {ETAPAS.map((e) => {
            const items = conDias
              .filter((x) => x.c.estado === e.estado)
              .filter((x) => e.estado !== 'activa' || (x.d ?? 0) <= 30)
              .sort((a, b) => (b.d ?? 0) - (a.d ?? 0));
            const kg = items.reduce((a, x) => a + kilos(x.c), 0);
            return (
              <div key={e.estado} className="bg-gray-50 rounded-xl border border-gray-200 flex flex-col min-h-[300px]">
                <div className="px-3 py-2.5 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900">{e.titulo}</h3>
                    <span className="text-xs font-semibold bg-white border border-gray-200 rounded-full px-2 tabular-nums">{items.length}</span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Siguiente: {e.quien}
                    {kg > 0 ? ` · ${fmtKg(kg)}` : ''}
                    {e.estado === 'activa' ? ' · últimos 30 días' : ''}
                  </p>
                </div>
                <div className="p-2 space-y-2 flex-1">
                  {items.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Sin órdenes</p>}
                  {items.map(({ c, d, luz }) => (
                    <button
                      key={c.id}
                      onClick={() => onAbrir(c.id)}
                      className={`w-full text-left bg-white rounded-lg border border-gray-200 border-l-4 ${COLOR[luz]} p-2.5 hover:shadow-md transition`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-gray-900 leading-tight line-clamp-2">{c.cliente ?? 'Cliente sin identificar'}</p>
                        <span className={`text-xs font-semibold tabular-nums whitespace-nowrap ${TEXTO[luz]}`}>{fmtDias(d)}</span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1 tabular-nums">
                        OC {c.ocNumero ?? '—'}
                        {c.numberPF ? ` · PF ${c.numberPF}` : ''}
                        {c.numberOrderSales ? ` · OV ${c.numberOrderSales}` : ''}
                      </p>
                      <p className="text-[11px] text-gray-500 tabular-nums">
                        {fmtKg(kilos(c))}
                        {c.fechaRequerida ? ` · requerida ${c.fechaRequerida}` : ''}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {c.accionPendiente && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-[#C4521A] font-medium">Por confirmar</span>}
                        {c.missing.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-medium">{c.missing.length} faltante(s)</span>}
                        {c.fechaRequerida && c.fechaRequerida < hoy && !['activa', 'cerrada'].includes(c.estado) && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-medium">Vencida</span>
                        )}
                        {c.simulated && <SimuladoBadge items={c.simulatedItems} />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
