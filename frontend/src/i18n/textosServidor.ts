'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useIdioma, type Idioma } from './idioma';

/**
 * Textos que llegan del servidor en español y la pantalla usa para su lógica (avisos y faltantes de la liquidación):
 * se traducen solo para mostrarlos. El servidor los traduce una vez y los guarda; aquí quedan en memoria.
 */
const cache = new Map<string, string>();
const clave = (i: Idioma, t: string) => `${i}:${t}`;

export function useTextosServidor(textos: readonly string[]): (texto: string) => string {
  const idioma = useIdioma();
  const [, setVersion] = useState(0);
  const firma = textos.join('\u0001');

  useEffect(() => {
    if (idioma === 'es') return;
    const faltan = [...new Set(textos)].filter((t) => t && !cache.has(clave(idioma, t))).slice(0, 60);
    if (!faltan.length) return;
    let vivo = true;
    api
      .traducirTextos(faltan)
      .then((r) => {
        faltan.forEach((t, i) => cache.set(clave(idioma, t), r[i] ?? t));
        if (vivo) setVersion((v) => v + 1);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
    // `firma` resume `textos`: así el efecto no se repite con cada arreglo nuevo de los mismos textos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idioma, firma]);

  return (texto: string) => (idioma === 'es' ? texto : (cache.get(clave(idioma, texto)) ?? texto));
}
