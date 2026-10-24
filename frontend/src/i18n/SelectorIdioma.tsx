'use client';

import { useEffect } from 'react';
import { Languages } from 'lucide-react';
import { IDIOMAS, cambiarIdioma, useIdioma, useT } from './idioma';

/** Selector ES / EN / PT / FR. `tono="claro"` para fondos naranjas u oscuros (menú lateral). */
export function SelectorIdioma({ tono = 'oscuro' }: { tono?: 'claro' | 'oscuro' }) {
  const idioma = useIdioma();
  const t = useT();
  const claro = tono === 'claro';
  return (
    <div className="flex items-center gap-2" role="group" aria-label={t('Idioma')}>
      <Languages className={`w-4 h-4 shrink-0 ${claro ? 'text-white/70' : 'text-gray-400'}`} aria-hidden />
      <div className={`flex rounded-lg p-0.5 ${claro ? 'bg-white/10' : 'bg-gray-100'}`}>
        {IDIOMAS.map((i) => (
          <button
            key={i.codigo}
            onClick={() => cambiarIdioma(i.codigo)}
            title={i.nombre}
            aria-pressed={idioma === i.codigo}
            className={`px-2 py-1 rounded-md text-[11px] font-bold transition ${
              idioma === i.codigo ? (claro ? 'bg-white text-[#F47735]' : 'bg-white text-[#F47735] shadow-sm') : claro ? 'text-white/75 hover:text-white' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {i.corto}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Mantiene `<html lang>` con el idioma escogido (lectores de pantalla, traductor del navegador). */
export function IdiomaDelDocumento() {
  const idioma = useIdioma();
  useEffect(() => {
    document.documentElement.lang = idioma;
  }, [idioma]);
  return null;
}
