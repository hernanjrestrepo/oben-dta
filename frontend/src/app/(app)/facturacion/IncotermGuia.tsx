'use client';

import { useState } from 'react';
import type { ConceptoLiquidacion, IncotermRegla } from '@/types';
import {
  Anchor,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  FileCheck,
  Landmark,
  Package,
  Ship,
  ShieldCheck,
  Truck,
  Warehouse,
  X,
  type LucideIcon,
} from 'lucide-react';

/**
 * Guía visual de Incoterms 2020 (ICC): qué costos paga el vendedor (Oben) y
 * cuáles el comprador, y hasta dónde llega la entrega — la forma en que se
 * explican normalmente los Incoterms (pedido de Hernán, 2026-10-01).
 */

interface Etapa {
  corto: string;
  icon: LucideIcon;
}

/** Cadena logística de origen a destino, en orden. */
const ETAPAS: Etapa[] = [
  { corto: 'Embalaje', icon: Package },
  { corto: 'Carga en fábrica', icon: ArrowUpFromLine },
  { corto: 'Transporte local', icon: Truck },
  { corto: 'Aduana exportación', icon: FileCheck },
  { corto: 'Terminal origen', icon: Warehouse },
  { corto: 'Carga a bordo', icon: Anchor },
  { corto: 'Flete internacional', icon: Ship },
  { corto: 'Seguro', icon: ShieldCheck },
  { corto: 'Terminal destino', icon: Warehouse },
  { corto: 'Transporte a destino', icon: Truck },
  { corto: 'Descarga en destino', icon: ArrowDownToLine },
  { corto: 'Aduana e impuestos importación', icon: Landmark },
];

interface IncotermInfo {
  nombre: string;
  es: string;
  grupo: 'E' | 'F' | 'C' | 'D';
  modo: 'Cualquier transporte' | 'Solo marítimo';
  /** Índices de ETAPAS que paga el vendedor. */
  vendedor: number[];
  /** Última etapa antes de que el riesgo pase al comprador. */
  entrega: number;
  formula: string;
  nota?: string;
}

const todas = (hasta: number) => Array.from({ length: hasta + 1 }, (_, i) => i);

export const INCOTERMS_2020: Record<string, IncotermInfo> = {
  EXW: { nombre: 'Ex Works', es: 'En fábrica', grupo: 'E', modo: 'Cualquier transporte', vendedor: [0], entrega: 0, formula: 'Precio = Mercancía en fábrica' },
  FCA: { nombre: 'Free Carrier', es: 'Franco transportista', grupo: 'F', modo: 'Cualquier transporte', vendedor: todas(3), entrega: 3, formula: 'Precio = Mercancía entregada al transportista' },
  FAS: { nombre: 'Free Alongside Ship', es: 'Franco al costado del buque', grupo: 'F', modo: 'Solo marítimo', vendedor: todas(4), entrega: 4, formula: 'Precio = Mercancía al costado del buque' },
  FOB: { nombre: 'Free On Board', es: 'Franco a bordo', grupo: 'F', modo: 'Solo marítimo', vendedor: todas(5), entrega: 5, formula: 'Precio = Mercancía a bordo (valor FOB)' },
  CFR: { nombre: 'Cost and Freight', es: 'Costo y flete', grupo: 'C', modo: 'Solo marítimo', vendedor: todas(6), entrega: 5, formula: 'Precio = Mercancía + Flete', nota: 'Oben paga el flete, pero el riesgo pasa al comprador cuando la carga sube al buque en origen.' },
  CIF: { nombre: 'Cost, Insurance and Freight', es: 'Costo, seguro y flete', grupo: 'C', modo: 'Solo marítimo', vendedor: todas(7), entrega: 5, formula: 'Precio = Mercancía + Flete + Seguro', nota: 'Oben paga flete y seguro, pero el riesgo pasa al comprador a bordo en origen.' },
  CPT: { nombre: 'Carriage Paid To', es: 'Transporte pagado hasta', grupo: 'C', modo: 'Cualquier transporte', vendedor: [...todas(6), 8], entrega: 3, formula: 'Precio = Mercancía + Flete', nota: 'Oben paga el transporte hasta destino; el riesgo pasa al entregar al primer transportista.' },
  CIP: { nombre: 'Carriage and Insurance Paid To', es: 'Transporte y seguro pagados hasta', grupo: 'C', modo: 'Cualquier transporte', vendedor: todas(8), entrega: 3, formula: 'Precio = Mercancía + Flete + Seguro', nota: 'Oben paga transporte y seguro hasta destino; el riesgo pasa al entregar al primer transportista.' },
  DAP: { nombre: 'Delivered At Place', es: 'Entregado en lugar', grupo: 'D', modo: 'Cualquier transporte', vendedor: todas(9), entrega: 9, formula: 'Precio = Mercancía + Flete + Seguro + Otros gastos en destino' },
  DPU: { nombre: 'Delivered at Place Unloaded', es: 'Entregado en lugar descargado', grupo: 'D', modo: 'Cualquier transporte', vendedor: todas(10), entrega: 10, formula: 'Precio = Mercancía + Flete + Seguro + Otros gastos + Descarga' },
  DDP: { nombre: 'Delivered Duty Paid', es: 'Entregado con derechos pagados', grupo: 'D', modo: 'Cualquier transporte', vendedor: todas(11), entrega: 11, formula: 'Precio = Mercancía + Flete + Seguro + Otros gastos + Impuestos de importación' },
};

const GRUPOS: Array<{ g: IncotermInfo['grupo']; label: string }> = [
  { g: 'E', label: 'Salida' },
  { g: 'F', label: 'Flete principal lo paga el comprador' },
  { g: 'C', label: 'Flete principal lo paga Oben' },
  { g: 'D', label: 'Llegada a destino' },
];

const CONCEPTOS: ConceptoLiquidacion[] = ['flete', 'seguro', 'otrosGastos'];
const CONCEPTO_LABEL: Record<ConceptoLiquidacion, string> = { flete: 'Flete', seguro: 'Seguro', otrosGastos: 'Otros gastos' };

export function IncotermGuia({
  reglas,
  seleccionado,
  delErp,
  onSeleccionar,
}: {
  reglas: IncotermRegla[] | null;
  seleccionado: string | null;
  delErp: boolean;
  onSeleccionar: (codigo: string) => void;
}) {
  const [verTabla, setVerTabla] = useState(false);
  const codigos = Object.keys(INCOTERMS_2020);
  const info = seleccionado ? INCOTERMS_2020[seleccionado] : undefined;
  const regla = reglas?.find((r) => r.codigo === seleccionado);

  return (
    <div className="space-y-4">
      {/* Selector agrupado por familia (E, F, C, D) */}
      <div className="flex flex-wrap gap-x-4 gap-y-3">
        {GRUPOS.map(({ g, label }) => (
          <div key={g}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
              Grupo {g} · {label}
            </p>
            <div className="flex gap-1.5">
              {codigos
                .filter((c) => INCOTERMS_2020[c].grupo === g)
                .map((c) => {
                  const sel = seleccionado === c;
                  return (
                    <button
                      key={c}
                      onClick={() => onSeleccionar(c)}
                      title={`${c} — ${INCOTERMS_2020[c].nombre} (${INCOTERMS_2020[c].es})`}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-bold tracking-wider transition ${
                        sel
                          ? 'border-[#F47735] bg-[#F47735] text-white shadow-sm'
                          : 'border-gray-200 bg-white text-gray-800 hover:border-[#F47735]/60 hover:bg-orange-50'
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {!info ? (
        <p className="text-sm text-gray-500">Escoge el Incoterm de la proforma para ver qué incluye y hasta dónde va.</p>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-gray-900">
              <span className="text-lg font-bold tracking-wider">{seleccionado}</span>{' '}
              <span className="font-medium">{info.nombre}</span>{' '}
              <span className="text-gray-500">· {info.es}</span>
              {delErp && (
                <span className="ml-2 align-middle text-[10px] px-1.5 py-px rounded border border-emerald-200 bg-emerald-50 text-emerald-700 font-medium">
                  del ERP de Oben
                </span>
              )}
            </p>
            <span className="text-xs text-gray-500">{info.modo}</span>
          </div>

          <BarraEtapas info={info} />

          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <p className="text-sm font-semibold text-gray-900">{info.formula}</p>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-gray-500">En la liquidación:</span>
              {CONCEPTOS.map((c) => {
                const si = !!regla?.conceptos.includes(c);
                return (
                  <span
                    key={c}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${
                      si ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-400 line-through'
                    }`}
                  >
                    {si ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                    {CONCEPTO_LABEL[c]}
                  </span>
                );
              })}
            </div>
          </div>
          {info.nota && <p className="mt-2 text-xs text-gray-600">{info.nota}</p>}
        </div>
      )}

      <button
        onClick={() => setVerTabla((v) => !v)}
        className="inline-flex items-center gap-1 text-xs font-medium text-[#C4521A] hover:underline"
      >
        <ChevronDown className={`w-3.5 h-3.5 transition ${verTabla ? 'rotate-180' : ''}`} />
        {verTabla ? 'Ocultar' : 'Ver'} los 11 Incoterms lado a lado
      </button>
      {verTabla && <TablaIncoterms seleccionado={seleccionado} onSeleccionar={onSeleccionar} />}
    </div>
  );
}

/** Las 12 etapas de origen a destino: verde = Oben, gris = comprador; la bandera marca la entrega. */
function BarraEtapas({ info }: { info: IncotermInfo }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-12 gap-1">
          {ETAPAS.map((e, i) => {
            const vendedor = info.vendedor.includes(i);
            const Icon = e.icon;
            return (
              <div key={i} className="relative">
                <div
                  className={`h-[74px] rounded-lg px-1 py-2 flex flex-col items-center justify-start gap-1 text-center border ${
                    vendedor
                      ? 'bg-emerald-500 border-emerald-600 text-white'
                      : 'bg-white border-gray-200 text-gray-500'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-[10px] leading-tight font-medium">{e.corto}</span>
                </div>
                {i === info.entrega && (
                  <div className="absolute -right-[5px] top-[-6px] bottom-[-6px] w-[3px] rounded bg-[#F47735] z-10" />
                )}
              </div>
            );
          })}
        </div>
        {/* Marca de entrega bajo la barra */}
        <div className="grid grid-cols-12 gap-1 mt-1.5">
          {ETAPAS.map((_, i) => (
            <div key={i} className="relative h-4">
              {i === info.entrega && (
                <span className="absolute right-[-4px] translate-x-1/2 whitespace-nowrap text-[10px] font-semibold text-[#C4521A]">
                  ▲ Entrega: aquí pasa el riesgo
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-1 flex items-center gap-4 text-[11px] text-gray-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-500" /> Paga Oben (vendedor)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border border-gray-300 bg-white" /> Paga el comprador
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-[3px] h-3 rounded bg-[#F47735]" /> Punto de entrega
          </span>
        </div>
      </div>
    </div>
  );
}

/** Matriz clásica de Incoterms: 11 filas × 12 etapas. */
function TablaIncoterms({ seleccionado, onSeleccionar }: { seleccionado: string | null; onSeleccionar: (c: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full min-w-[820px] text-[11px] border-collapse">
        <thead>
          <tr className="bg-gray-50">
            <th className="px-2 py-2 text-left font-semibold text-gray-600 w-16">Incoterm</th>
            {ETAPAS.map((e, i) => {
              const Icon = e.icon;
              return (
                <th key={i} className="px-1 py-2 font-medium text-gray-600 align-bottom">
                  <div className="flex flex-col items-center gap-1">
                    <Icon className="w-3.5 h-3.5 text-gray-500" />
                    <span className="leading-tight">{e.corto}</span>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {Object.entries(INCOTERMS_2020).map(([c, info]) => (
            <tr
              key={c}
              onClick={() => onSeleccionar(c)}
              className={`cursor-pointer border-t border-gray-100 ${seleccionado === c ? 'bg-orange-50' : 'hover:bg-gray-50'}`}
            >
              <td className="px-2 py-1.5 font-bold tracking-wider text-gray-900" title={`${info.nombre} · ${info.es}`}>
                {c}
              </td>
              {ETAPAS.map((_, i) => (
                <td key={i} className="px-0.5 py-1">
                  <div
                    className={`h-5 rounded-sm ${info.vendedor.includes(i) ? 'bg-emerald-500' : 'bg-gray-100'} ${
                      i === info.entrega ? 'border-r-[3px] border-[#F47735]' : ''
                    }`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[10px] text-gray-500 border-t border-gray-100">
        Incoterms® 2020 (Cámara de Comercio Internacional). Verde: lo paga Oben. La línea naranja marca dónde se entrega y pasa el riesgo al comprador.
      </p>
    </div>
  );
}
