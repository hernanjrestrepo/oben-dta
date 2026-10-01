/**
 * Firma "made by Paradixe" abajo a la derecha en TODAS las pantallas (también
 * el login): todo software de Paradixe la lleva y al presionarla abre
 * paradixe.xyz (Hernán, 2026-10-01 — mismo diseño que EVA BPO).
 */
export function ParadixeFirma() {
  return (
    <a
      href="https://www.paradixe.xyz/"
      target="_blank"
      rel="noopener"
      aria-label="Made by Paradixe (abre paradixe.xyz)"
      className="fixed right-3.5 bottom-2.5 z-40 inline-flex items-center gap-[7px] px-[11px] py-1.5 rounded-full bg-slate-900/75 backdrop-blur-sm border border-slate-400/20 text-[10.5px] leading-none font-semibold tracking-[.06em] text-slate-300/90 no-underline transition hover:bg-slate-900/95 hover:border-slate-400/45 hover:text-white print:hidden"
    >
      <span>made by</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/paradixe-logo.png" alt="Paradixe" className="h-[11px] w-auto block" />
    </a>
  );
}
