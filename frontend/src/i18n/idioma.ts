'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { TEXTOS } from './textos';

/**
 * Idiomas de Oben Xmart (Hernán, 24-oct: "español, inglés, portugués y francés"). El texto en español ES la clave:
 * cada pantalla envuelve sus textos en `t('…')` y `textos.ts` trae la traducción. Lo que aún no está traducido sale
 * en español (nunca un texto vacío). La preferencia es por navegador y viaja al servidor en `Accept-Language`.
 */
export type Idioma = 'es' | 'en' | 'pt' | 'fr';

export const IDIOMAS: Array<{ codigo: Idioma; nombre: string; corto: string }> = [
  { codigo: 'es', nombre: 'Español', corto: 'ES' },
  { codigo: 'en', nombre: 'English', corto: 'EN' },
  { codigo: 'pt', nombre: 'Português', corto: 'PT' },
  { codigo: 'fr', nombre: 'Français', corto: 'FR' },
];

const CLAVE = 'oben-xmart.idioma';
const EVENTO = 'oben-xmart:idioma';

export function leerIdioma(): Idioma {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === 'en' || v === 'pt' || v === 'fr' ? v : 'es';
  } catch {
    return 'es';
  }
}

export function cambiarIdioma(i: Idioma) {
  try {
    localStorage.setItem(CLAVE, i);
  } catch {
    /* almacenamiento no disponible: queda en español */
  }
  document.documentElement.lang = i;
  window.dispatchEvent(new Event(EVENTO));
}

function suscribir(cb: () => void) {
  window.addEventListener('storage', cb);
  window.addEventListener(EVENTO, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(EVENTO, cb);
  };
}

export function useIdioma(): Idioma {
  return useSyncExternalStore(suscribir, leerIdioma, () => 'es');
}

export type Vars = Record<string, string | number>;

/** Traduce un texto en español al idioma dado; `{nombre}` se reemplaza con `vars`. */
export function traducir(idioma: Idioma, texto: string, vars?: Vars): string {
  const base = idioma === 'es' ? texto : (TEXTOS[texto]?.[idioma] ?? texto);
  return vars ? base.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] !== undefined ? String(vars[k]) : m)) : base;
}

/** `const t = useT(); t('Cerrar Sesión')`. */
export function useT() {
  const idioma = useIdioma();
  return useCallback((texto: string, vars?: Vars) => traducir(idioma, texto, vars), [idioma]);
}

/** Configuración regional para fechas y números (Colombia en español). */
export function localeDe(i: Idioma): string {
  return { es: 'es-CO', en: 'en-US', pt: 'pt-BR', fr: 'fr-FR' }[i];
}
