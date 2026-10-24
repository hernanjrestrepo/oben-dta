'use client';

import { useT, localeActivo } from '@/i18n/idioma';
import { useState } from 'react';
import type { CasoEstado, ComercialCaso, ComercialTablero } from '@/types';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ChevronDown, Clock, Hourglass, Inbox, LayoutGrid, List, Timer, X } from 'lucide-react';
import { ACCION_LABEL, EstadoBadge, SimuladoBadge, fecha } from './comun';

/** Etapas del embudo, en orden, con la fecha que marca la entrada a cada una y quién debe moverla. */
export const ETAPAS: Array<{ estado: CasoEstado; titulo: string; quien: string; desde: (c: ComercialCaso) => string | undefined }> = [
  { estado: 'oc_recibida', titulo: 'OC recibida', quien: 'Comercial confirma', desde: (c) => c.fechas.ocRecibida ?? c.ocRecibidaEn },
  { estado: 'sin_cubicar', titulo: 'Proforma sin cubicar', quien: 'Planeación cubica', desde: (c) => c.fechas.proformaCreada },
  { estado: 'cubicada', titulo: 'Cubicada', quien: 'Sale al cliente', desde: (c) => c.fechas.cubicada },
  { estado: 'enviada_cliente', titulo: 'Esperando al cliente', quien: 'Cliente aprueba', desde: (c) => c.fechas.enviadaCliente },
  { estado: 'retenida', titulo: 'Retenida en cartera', quien: 'Cartera libera', desde: (c) => c.fechas.retenida },
  { estado: 'activa', titulo: 'OV activa', quien: 'Producción', desde: (c) => c.fechas.activa },
];

/** Días de alerta por etapa: más de esto en la misma etapa = demorada. */
const ALERTA_DIAS: Partial<Record<CasoEstado, number>> = { oc_recibida: 1, sin_cubicar: 2, cubicada: 1, enviada_cliente: 3, retenida: 2 };

const TIEMPOS: Array<[string, string]> = [
  ['ocAProforma', 'OC → Proforma'],
  ['proformaACubicada', 'Proforma → cubicada'],
  ['envioAAprobacion', 'Envío → aprobación del cliente'],
  ['retenidaALiberada', 'Retenida → cartera libera'],
  ['ocAActiva', 'OC → OV activa'],
];

const DIA = 86_400_000;
const dias = (desde?: string | null) => (desde ? Math.max(0, (Date.now() - new Date(desde).getTime()) / DIA) : null);
const fmtDias = (d: number | null) => (d === null ? '—' : d < 1 ? `${Math.max(1, Math.round(d * 24))} h` : `${Math.floor(d)} d`);
const kilos = (c: ComercialCaso) => c.lineas.reduce((a, l) => a + (l.kilos ?? 0), 0);
const fmtKg = (n: number) => `${Math.round(n).toLocaleString(localeActivo())} kg`;
const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const esReal = (c: ComercialCaso) => !!c.numberPF && !/^SIM-/i.test(c.numberPF);

type Luz = 'verde' | 'ambar' | 'rojo';
function semaforo(c: ComercialCaso, d: number | null): Luz {
  const limite = ALERTA_DIAS[c.estado];
  if (d === null || limite === undefined) return 'verde';
  if (d > limite * 2) return 'rojo';
  if (d > limite) return 'ambar';
  return 'verde';
}
const COLOR: Record<Luz, string> = { verde: 'border-l-emerald-500', ambar: 'border-l-amber-500', rojo: 'border-l-red-500' };
const TEXTO: Record<Luz, string> = { verde: 'text-emerald-700', ambar: 'text-amber-700', rojo: 'text-red-700' };

/** Qué le toca a cada tarjeta: lo que espera, en palabras de la persona que lo hace. */
function siguiente(c: ComercialCaso, quien: string): { texto: string; urgente: boolean } {
  if (c.missing.length > 0) return { texto: `Completar ${c.missing.length} dato${c.missing.length === 1 ? '' : 's'}`, urgente: true };
  if (c.accionPendiente) return { texto: `Confirmar: ${ACCION_LABEL[c.accionPendiente.tipo] ?? c.accionPendiente.tipo}`, urgente: true };
  if (c.atencion.length > 0) return { texto: 'Revisar aviso', urgente: true };
  return { texto: quien, urgente: false };
}

type Foco = 'todas' | 'esperan' | 'demoradas' | 'vencidas';
const FOCO_LABEL: Record<Foco, string> = { todas: '', esperan: 'Esperan una persona', demoradas: 'Demoradas', vencidas: 'Fecha requerida vencida' };

/**
 * CRM del flujo Comercial: indicadores (cada uno filtra el tablero con un clic), el tablero por etapa con semáforo
 * de días en la etapa, una vista de lista, lo que requiere atención y los tiempos promedio. Clic en cualquier orden
 * abre su detalle.
 */
export function Pipeline({ casos, tablero, onAbrir }: { casos: ComercialCaso[]; tablero: ComercialTablero | null; onAbrir: (id: string) => void }) {
  const t = useT();
  const [vista, setVista] = useState<'tablero' | 'lista'>('tablero');
  const [foco, setFoco] = useState<Foco>('todas');
  const [masIndicadores, setMasIndicadores] = useState(false);

  const hoy = new Date().toISOString().slice(0, 10);
  const cerrado = (c: ComercialCaso) => ['activa', 'cerrada', 'rechazada', 'anulada'].includes(c.estado);
  const abiertos = casos.filter((c) => !cerrado(c));
  const conDias = casos.map((c) => {
    const etapa = ETAPAS.find((e) => e.estado === c.estado);
    const d = dias(etapa?.desde(c) ?? c.ocRecibidaEn);
    return { c, d, luz: semaforo(c, d) };
  });
  const esperan = (c: ComercialCaso) => !cerrado(c) && (!!c.accionPendiente || c.missing.length > 0);
  const demorada = (x: { c: ComercialCaso; luz: Luz }) => !cerrado(x.c) && x.luz !== 'verde';
  const vencida = (c: ComercialCaso) => !cerrado(c) && !!c.fechaRequerida && c.fechaRequerida < hoy;
  const pasaFoco = (x: { c: ComercialCaso; luz: Luz }) =>
    foco === 'todas' || (foco === 'esperan' && esperan(x.c)) || (foco === 'demoradas' && demorada(x)) || (foco === 'vencidas' && vencida(x.c));

  const ciclo = promedio(casos.filter((c) => c.fechas.activa).map((c) => (new Date(c.fechas.activa!).getTime() - new Date(c.ocRecibidaEn).getTime()) / DIA));
  const aprobacion = promedio(casos.filter((c) => c.fechas.enviadaCliente && c.fechas.aprobadaCliente).map((c) => (new Date(c.fechas.aprobadaCliente!).getTime() - new Date(c.fechas.enviadaCliente!).getTime()) / DIA));
  const perdidas = casos.filter((c) => c.estado === 'rechazada' || c.estado === 'anulada').length;
  const ganadas = casos.filter((c) => ['activa', 'cerrada'].includes(c.estado)).length;
  const conversion = ganadas + perdidas > 0 ? Math.round((ganadas / (ganadas + perdidas)) * 100) : null;
  const nEsperan = casos.filter(esperan).length;
  const nDemoradas = conDias.filter(demorada).length;
  const nVencidas = casos.filter(vencida).length;

  const kpis: Array<{ icon: React.ReactNode; label: string; valor: string; nota?: string; alerta?: boolean; foco?: Foco }> = [
    { icon: <Inbox className="w-4 h-4" />, label: 'Órdenes en curso', valor: String(abiertos.length), nota: fmtKg(abiertos.reduce((a, c) => a + kilos(c), 0)), foco: 'todas' },
    { icon: <Hourglass className="w-4 h-4" />, label: 'Esperan una persona', valor: String(nEsperan), nota: 'confirmar o completar', alerta: nEsperan > 0, foco: 'esperan' },
    { icon: <AlertTriangle className="w-4 h-4" />, label: 'Demoradas', valor: String(nDemoradas), nota: 'más tiempo del normal', alerta: nDemoradas > 0, foco: 'demoradas' },
    { icon: <CalendarClock className="w-4 h-4" />, label: 'Fecha vencida', valor: String(nVencidas), nota: 'el cliente ya la esperaba', alerta: nVencidas > 0, foco: 'vencidas' },
    { icon: <Timer className="w-4 h-4" />, label: 'OC → OV activa', valor: ciclo === null ? '—' : fmtDias(ciclo), nota: 'promedio' },
    { icon: <Clock className="w-4 h-4" />, label: 'Respuesta del cliente', valor: aprobacion === null ? '—' : fmtDias(aprobacion), nota: 'promedio' },
    { icon: <CheckCircle2 className="w-4 h-4" />, label: 'Conversión', valor: conversion === null ? '—' : `${conversion} %`, nota: `${ganadas} activas · ${perdidas} perdidas` },
  ];

  const visibles = conDias.filter(pasaFoco);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {kpis.map((k) => {
          const activo = k.foco && foco === k.foco && k.foco !== 'todas';
          const Tag = k.foco ? 'button' : 'div';
          return (
            <Tag
              key={k.label}
              {...(k.foco ? { onClick: () => setFoco(foco === k.foco ? 'todas' : k.foco!), title: k.foco === 'todas' ? 'Ver todas' : `Ver solo: ${k.label}` } : {})}
              className={`text-left rounded-xl border p-3 transition ${activo ? 'ring-2 ring-[#F47735] border-[#F47735] bg-orange-50' : k.alerta ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'} ${k.foco ? 'hover:shadow-md cursor-pointer' : ''}`}
            >
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                {k.icon}
                {k.label}
              </div>
              <p className="text-2xl font-bold text-gray-900 tabular-nums mt-1">{k.valor}</p>
              {k.nota && <p className="text-[11px] text-gray-500">{k.nota}</p>}
            </Tag>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="font-medium text-gray-700">{t('Tiempo en la etapa:')}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500" />{' '}{t('normal')}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-500" />{' '}{t('demorada')}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500" />{' '}{t('muy demorada')}</span>
          {foco !== 'todas' && (
            <button onClick={() => setFoco('todas')} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-[#C4521A] font-medium">
              {t('Mostrando:')}{' '}{FOCO_LABEL[foco]} <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-sm">
          {(
            [
              ['tablero', 'Tablero', LayoutGrid],
              ['lista', 'Lista', List],
            ] as const
          ).map(([v, label, Icon]) => (
            <button key={v} onClick={() => setVista(v)} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md ${vista === v ? 'bg-[#F47735] text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      {vista === 'tablero' ? (
        <div className="overflow-x-auto pb-2">
          <div className="grid grid-flow-col auto-cols-[minmax(230px,1fr)] gap-3 min-w-max xl:min-w-0">
            {ETAPAS.map((e) => {
              const items = visibles
                .filter((x) => x.c.estado === e.estado)
                .filter((x) => e.estado !== 'activa' || (x.d ?? 0) <= 30)
                .sort((a, b) => (b.d ?? 0) - (a.d ?? 0));
              const kg = items.reduce((a, x) => a + kilos(x.c), 0);
              return (
                <div key={e.estado} className="bg-gray-50 rounded-xl border border-gray-200 flex flex-col min-h-[320px]">
                  <div className="px-3 py-2.5 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900">{e.titulo}</h3>
                      <span className="text-xs font-semibold bg-white border border-gray-200 rounded-full px-2 tabular-nums">{items.length}</span>
                    </div>
                    <p className="text-[11px] text-gray-500">
                      {e.quien}
                      {kg > 0 ? ` · ${fmtKg(kg)}` : ''}
                      {e.estado === 'activa' ? ' · últimos 30 días' : ''}
                    </p>
                  </div>
                  <div className="p-2 space-y-2 flex-1">
                    {items.length === 0 && <p className="text-xs text-gray-400 text-center py-6">{t('Sin órdenes')}</p>}
                    {items.map(({ c, d, luz }) => {
                      const sig = siguiente(c, e.quien);
                      return (
                        <button
                          key={c.id}
                          onClick={() => onAbrir(c.id)}
                          className={`group w-full text-left bg-white rounded-lg border border-gray-200 border-l-4 ${COLOR[luz]} p-2.5 hover:shadow-md hover:border-gray-300 transition cursor-pointer`}
                          title={t('Abrir el detalle de la orden')}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2">{c.cliente ?? 'Cliente sin identificar'}</p>
                            <span className={`text-xs font-semibold tabular-nums whitespace-nowrap ${TEXTO[luz]}`}>{fmtDias(d)}</span>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1 tabular-nums">
                            OC {c.ocNumero ?? '—'} · {fmtKg(kilos(c))}
                            {c.fechaRequerida ? ` · para ${c.fechaRequerida}` : ''}
                          </p>
                          {(c.numberPF || c.numberOrderSales) && (
                            <div className="flex flex-wrap items-center gap-1 mt-1.5">
                              {c.numberPF && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold tabular-nums ${esReal(c) ? 'bg-sky-100 text-sky-800' : 'bg-gray-100 text-gray-600'}`} title={esReal(c) ? 'Proforma creada en OBEN MAS' : 'Proforma del simulador'}>
                                  PF {c.numberPF}
                                </span>
                              )}
                              {(c.numberOrderSales || ['retenida', 'activa', 'cerrada'].includes(c.estado)) && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-indigo-100 text-indigo-800 tabular-nums" title={c.numberOrderSales ? undefined : 'Oben todavía no devuelve el número de la orden de venta por su API'}>
                                  {c.numberOrderSales ? `OV ${c.numberOrderSales}` : 'OV creada'}
                                </span>
                              )}
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-1 mt-1.5">
                            <span className={`text-[11px] font-medium ${sig.urgente ? 'text-[#C4521A]' : 'text-gray-500'}`}>{sig.texto}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#F47735] transition" />
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {vencida(c) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-medium">{t('Vencida')}</span>}
                            {c.simulated && <SimuladoBadge items={c.simulatedItems} />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {visibles.length === 0 ? (
            <p className="text-sm text-gray-500 p-6 text-center">{t('No hay órdenes con estos filtros.')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-600">
                    <th className="px-3 py-2 font-semibold">{t('Recibida')}</th>
                    <th className="px-3 py-2 font-semibold">{t('Cliente')}</th>
                    <th className="px-3 py-2 font-semibold">OC</th>
                    <th className="px-3 py-2 font-semibold">{t('Proforma / OV')}</th>
                    <th className="px-3 py-2 font-semibold">{t('Etapa')}</th>
                    <th className="px-3 py-2 font-semibold">{t('Siguiente paso')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibles
                    .sort((a, b) => new Date(b.c.ocRecibidaEn).getTime() - new Date(a.c.ocRecibidaEn).getTime())
                    .map(({ c }) => {
                      const etapa = ETAPAS.find((e) => e.estado === c.estado);
                      const sig = siguiente(c, etapa?.quien ?? '—');
                      return (
                        <tr key={c.id} onClick={() => onAbrir(c.id)} className="hover:bg-orange-50/40 cursor-pointer">
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fecha(c.ocRecibidaEn)}</td>
                          <td className="px-3 py-2 text-gray-900">
                            {c.cliente ?? c.contactoEmail} {c.simulated && <SimuladoBadge items={c.simulatedItems} />}
                          </td>
                          <td className="px-3 py-2 text-gray-700">{c.ocNumero ?? '—'}</td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-700">
                            {c.numberPF ?? '—'}
                            {c.numberOrderSales ? ` / ${c.numberOrderSales}` : ''}
                          </td>
                          <td className="px-3 py-2">
                            <EstadoBadge estado={c.estado} />
                          </td>
                          <td className={`px-3 py-2 text-xs ${sig.urgente ? 'text-[#C4521A] font-medium' : 'text-gray-500'}`}>{sig.texto}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tablero && tablero.requierenAtencion.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />{' '}{t('Requieren atención (')}{tablero.requierenAtencion.length})
          </h3>
          <ul className="divide-y divide-gray-100">
            {tablero.requierenAtencion.map((a) => (
              <li key={a.id}>
                <button onClick={() => onAbrir(a.id)} className="w-full text-left py-2 px-2 rounded hover:bg-gray-50 flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-gray-900">{a.cliente ?? '(sin identificar)'}</span>
                      <EstadoBadge estado={a.estado} />
                      <span className="text-gray-400 text-xs">
                        OC {a.ocNumero ?? '—'}
                        {a.numberPF ? ` · PF ${a.numberPF}` : ''}
                      </span>
                    </span>
                    {a.accionPendiente && <span className="block text-xs text-amber-800 mt-0.5">{t('Confirmar:')}{' '}{a.accionPendiente}</span>}
                    {a.motivos.slice(0, 2).map((m) => (
                      <span key={m} className="block text-xs text-red-700 mt-0.5">
                        {m}
                      </span>
                    ))}
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tablero && (
        <div className="bg-white rounded-xl border border-gray-200">
          <button onClick={() => setMasIndicadores((x) => !x)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-900">
            {t('Más indicadores: tiempos promedio por etapa y órdenes por cliente')}
            <ChevronDown className={`w-4 h-4 text-gray-500 transition ${masIndicadores ? 'rotate-180' : ''}`} />
          </button>
          {masIndicadores && (
            <div className="grid md:grid-cols-2 gap-6 px-4 pb-4">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{t('Tiempos promedio (horas)')}</h4>
                <ul className="text-sm space-y-1">
                  {TIEMPOS.map(([k, label]) => (
                    <li key={k} className="flex justify-between">
                      <span className="text-gray-600">{label}</span>
                      <span className="font-medium tabular-nums">{tablero.tiemposPromedioHoras[k] ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{t('Por cliente (abiertas / total)')}</h4>
                <ul className="text-sm space-y-1">
                  {tablero.porCliente.slice(0, 10).map((c) => (
                    <li key={c.cliente} className="flex justify-between gap-2">
                      <span className="text-gray-700 truncate">{c.cliente}</span>
                      <span className="tabular-nums text-gray-500">
                        {c.abiertas}/{c.total}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
