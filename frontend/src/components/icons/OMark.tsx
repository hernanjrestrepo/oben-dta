/**
 * La "o" del logo de Oben (recortada de public/logo-oben.svg, mismo path
 * exacto — no es una letra genérica) para usarla como ícono, p. ej. en el
 * botón flotante de EVA en vez de un ícono genérico.
 */
export function OMark({ className }: { className?: string }) {
  return (
    <svg viewBox="95 360 180 195" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M262.5,456.61c0,48.08-25.01,89.33-79.92,89.33s-79.9-41.25-79.9-89.33,25-89.36,79.9-89.36,79.92,41.25,79.92,89.36M165.03,456.61c0,17.54,2.28,41.57,17.55,41.57s17.55-24.04,17.55-41.57-2.28-41.6-17.55-41.6-17.55,24.05-17.55,41.6" />
    </svg>
  );
}
