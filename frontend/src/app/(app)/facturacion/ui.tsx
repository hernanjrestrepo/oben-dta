'use client';

import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Hourglass, X } from 'lucide-react';

export { SimuladoBadge, btnPrimary, btnSecondary, fecha, inputCls } from '../comercial/comun';

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function usd(n: number | null | undefined): string {
  return isNum(n)
    ? `US$ ${n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';
}

/** Monto sin prefijo, para tablas cuya cabecera ya dice USD. */
export function num2(n: number | null | undefined): string {
  return isNum(n) ? n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
}

/**
 * Separa lo que falta del envío/encabezado (lo que el usuario debe resolver)
 * de lo que falta por línea (consecuencia: se calcula al completar lo primero).
 */
export function agruparFaltantes(missing: string[]): { generales: string[]; lineas: string[]; visibles: string[] } {
  const lineas = missing.filter((m) => m.startsWith('Línea '));
  const generales = missing.filter((m) => !m.startsWith('Línea '));
  const visibles = generales.length
    ? [...generales, ...(lineas.length ? [`Valores por línea (${lineas.length}): se calculan al completar lo anterior.`] : [])]
    : lineas;
  return { generales, lineas, visibles };
}

export function kg(n: number | null | undefined): string {
  return isNum(n) ? `${n.toLocaleString('es-CO', { maximumFractionDigits: 2 })} kg` : '—';
}

/** Valores por kg: 4 decimales, como los define José. */
export function unit(n: number | null | undefined): string {
  return isNum(n) ? n.toLocaleString('es-CO', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : '—';
}

/** "12,5" o "12.5" → 12.5; vacío o inválido → null (nunca 0). */
export function parseNum(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, '');
  if (!t) return null;
  const normalized = t.includes(',') && !t.includes('.') ? t.replace(',', '.') : t.replace(/,/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`bg-white rounded-xl shadow-sm border border-gray-200 ${className}`}>{children}</section>;
}

export function CardHeader({ title, subtitle, right, icon }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-gray-100">
      <div className="min-w-0">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          {icon}
          {title}
        </h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Field({ label, hint, children, className = '' }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-400 mt-1">{hint}</span>}
    </label>
  );
}

/** Lo que falta — nunca se inventa. Se colapsa si es largo. */
export function Faltantes({ items, titulo = 'Falta para continuar' }: { items: string[]; titulo?: string }) {
  const [abierto, setAbierto] = useState(false);
  if (items.length === 0) return null;
  const visibles = abierto ? items : items.slice(0, 5);
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" /> {titulo} ({items.length})
      </p>
      <ul className="mt-2 space-y-1 text-xs text-amber-900">
        {visibles.map((m) => (
          <li key={m} className="flex gap-2">
            <span className="mt-1.5 w-1 h-1 rounded-full bg-amber-500 shrink-0" />
            <span>{m}</span>
          </li>
        ))}
      </ul>
      {items.length > 5 && (
        <button onClick={() => setAbierto(!abierto)} className="mt-2 text-xs font-medium text-amber-800 hover:underline inline-flex items-center gap-1">
          {abierto ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {abierto ? 'Ver menos' : `Ver los ${items.length - 5} restantes`}
        </button>
      )}
    </div>
  );
}

export function Listo({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 flex items-center gap-2">
      <CheckCircle2 className="w-4 h-4 shrink-0" /> {children}
    </div>
  );
}

/** Lo que es lectura nuestra y José aún no confirma por escrito. */
export function PendienteConfirmar({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
      <p className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
        <Hourglass className="w-4 h-4" /> Pendiente de confirmación de Oben
      </p>
      <p className="text-xs text-indigo-900/80 mt-1">
        El cálculo se puede revisar y simular completo; el envío al ERP de Oben se habilita cuando José confirme estos puntos.
      </p>
      <ul className="mt-2 space-y-1 text-xs text-indigo-900">
        {items.map((m) => (
          <li key={m} className="flex gap-2">
            <span className="mt-1.5 w-1 h-1 rounded-full bg-indigo-500 shrink-0" />
            <span>{m}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Correos como chips: Enter, coma o salir del campo agregan; la X quita. */
export function EmailChips({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const [invalido, setInvalido] = useState(false);

  function agregar(raw: string) {
    const nuevos = raw
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (nuevos.length === 0) return;
    if (nuevos.some((e) => !EMAIL.test(e))) {
      setInvalido(true);
      return;
    }
    onChange([...new Set([...value, ...nuevos])]);
    setDraft('');
    setInvalido(false);
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 min-h-[42px] px-2 py-1.5 border rounded-lg bg-white focus-within:ring-2 focus-within:ring-[#F47735] ${
        invalido ? 'border-red-400' : 'border-gray-300'
      }`}
    >
      {value.map((e) => (
        <span key={e} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-xs text-gray-800">
          {e}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== e))} className="p-0.5 rounded-full hover:bg-orange-100" aria-label={`Quitar ${e}`}>
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setInvalido(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
            e.preventDefault();
            agregar(draft);
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft && agregar(draft)}
        placeholder={value.length ? '' : placeholder}
        className="flex-1 min-w-[180px] px-1 py-1 text-sm outline-none text-gray-900"
      />
      {invalido && <span className="w-full text-[11px] text-red-600 px-1">Correo no válido.</span>}
    </div>
  );
}

/** Barra apilada: en qué se va el valor total de la mercancía. */
export function Composicion({ partes }: { partes: Array<{ label: string; valor: number; color: string }> }) {
  const total = partes.reduce((a, p) => a + Math.max(p.valor, 0), 0);
  if (!(total > 0)) return null;
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
        {partes.map((p) =>
          p.valor > 0 ? (
            <div key={p.label} className={`${p.color} transition-all duration-500`} style={{ width: `${(p.valor / total) * 100}%` }} title={`${p.label}: ${usd(p.valor)}`} />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {partes.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5 text-xs text-gray-600">
            <span className={`w-2.5 h-2.5 rounded-sm ${p.color}`} />
            {p.label} <span className="font-medium text-gray-900">{usd(p.valor)}</span>
            <span className="text-gray-400">({((Math.max(p.valor, 0) / total) * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Kpi({ label, value, tone = 'default' }: { label: string; value: ReactNode; tone?: 'default' | 'brand' | 'muted' }) {
  const cls = tone === 'brand' ? 'text-[#E5641F]' : tone === 'muted' ? 'text-gray-400' : 'text-gray-900';
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`font-semibold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}
