'use client';

import { useT } from '@/i18n/idioma';
import { createElement } from 'react';
import { Bot, CheckCircle2, Circle, Eye, Lock, RefreshCw, Sparkles, type LucideIcon } from 'lucide-react';
import { OPCIONES_MENU } from '@/lib/menu';
import type { EstadoModuloAcademy } from '@/types';

/** Paleta de Oben Group (obengroup.com). */
export const OBEN = { naranja: '#F47735', naranjaOscuro: '#C4521A', grafito: '#56565A', grafitoOscuro: '#2E2E31', grisClaro: '#F1F1F1' };

const POR_HREF = new Map(OPCIONES_MENU.map((o) => [o.href, o.icon]));

/** Icono de cada lección: el mismo de su opción del menú. */
export function iconoDe(key: string, href: string | null): LucideIcon {
  if (key === 'bienvenida') return Sparkles;
  if (key === 'mia') return Bot;
  return (href && POR_HREF.get(href)) || Sparkles;
}

/** Icono de la lección como componente (el linter del compilador no deja escoger componentes durante el render). */
export function IconoModulo({ moduloKey, href, className }: { moduloKey: string; href: string | null; className?: string }) {
  return createElement(iconoDe(moduloKey, href), { className });
}

const ESTADOS: Record<EstadoModuloAcademy, { texto: string; clase: string; icono: LucideIcon }> = {
  aprobado: { texto: 'Aprobado', clase: 'bg-emerald-50 text-emerald-700 border-emerald-200', icono: CheckCircle2 },
  visto: { texto: 'En curso', clase: 'bg-amber-50 text-amber-700 border-amber-200', icono: Eye },
  actualizado: { texto: 'Con novedades', clase: 'bg-sky-50 text-sky-700 border-sky-200', icono: RefreshCw },
  pendiente: { texto: 'Por empezar', clase: 'bg-gray-50 text-gray-600 border-gray-200', icono: Circle },
};

export function EstadoPill({ estado, bloquea }: { estado: EstadoModuloAcademy; bloquea?: boolean }) {
  const t = useT();
  if (bloquea) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-orange-50 text-[#C4521A] border-orange-200">
        <Lock className="w-3 h-3" />{' '}{t('Bloquea operar')}
      </span>
    );
  }
  const e = ESTADOS[estado];
  const Icono = e.icono;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${e.clase}`}>
      <Icono className="w-3 h-3" /> {e.texto}
    </span>
  );
}

/** Anillo de avance (0–100). */
export function Anillo({ valor, tam = 72, grosor = 7, claro = false, children }: { valor: number; tam?: number; grosor?: number; claro?: boolean; children?: React.ReactNode }) {
  const r = (tam - grosor) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, valor));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: tam, height: tam }}>
      <svg width={tam} height={tam} className="-rotate-90">
        <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke={claro ? 'rgba(255,255,255,0.15)' : '#EEEEEE'} strokeWidth={grosor} />
        <circle
          cx={tam / 2}
          cy={tam / 2}
          r={r}
          fill="none"
          stroke={OBEN.naranja}
          strokeWidth={grosor}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * v) / 100}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.2, 0.8, 0.2, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

/** Abre a MIA con una pregunta ya escrita. */
export function preguntarAMia(texto: string) {
  window.dispatchEvent(new CustomEvent('mia:preguntar', { detail: texto }));
}
