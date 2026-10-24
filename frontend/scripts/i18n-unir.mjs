#!/usr/bin/env node
/**
 * Une las traducciones por lotes (scripts/trad/lote-*.json, alineadas con scripts/i18n-pendientes.json) en
 * src/i18n/textos-pantallas.ts. Además normaliza en el código las entidades HTML que quedaron dentro de t('…')
 * (&quot; &gt; &lt; &amp;): en JSX eran texto, dentro de un string se verían tal cual.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = join(dirname(fileURLToPath(import.meta.url)), '..');
const entidades = (t) => t.replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// 1) Código: entidades dentro de t('…').
const recorrer = (d, out = []) => {
  for (const n of readdirSync(d)) {
    const f = join(d, n);
    if (statSync(f).isDirectory()) recorrer(f, out);
    else if (f.endsWith('.tsx')) out.push(f);
  }
  return out;
};
let tocados = 0;
for (const f of recorrer(join(frontend, 'src'))) {
  const s = readFileSync(f, 'utf8');
  const n = s.replace(/\bt\('((?:[^'\\]|\\.)*)'/g, (m, k) => (/&(quot|gt|lt|amp|apos);/.test(k) ? `t('${entidades(k)}'` : m));
  if (n !== s) {
    writeFileSync(f, n);
    tocados++;
  }
}

// 2) Diccionario.
const pendientes = JSON.parse(readFileSync(join(frontend, 'scripts', 'i18n-pendientes.json'), 'utf8')).map(entidades);
const dic = {};
for (const n of readdirSync(join(frontend, 'scripts', 'trad')).sort()) {
  const l = JSON.parse(readFileSync(join(frontend, 'scripts', 'trad', n), 'utf8'));
  if (l.en.length !== l.pt.length || l.en.length !== l.fr.length) throw new Error(`${n}: largos distintos`);
  l.en.forEach((_, i) => {
    const clave = pendientes[l.desde + i];
    if (clave === undefined) throw new Error(`${n}: índice ${l.desde + i} fuera de la lista`);
    dic[clave] = { en: l.en[i], pt: l.pt[i], fr: l.fr[i] };
  });
}
const ts = `// GENERADO por scripts/i18n-unir.mjs desde scripts/trad/*.json — para corregir una traducción, editar el lote y volver a correrlo.
export const TEXTOS_PANTALLAS: Record<string, { en: string; pt: string; fr: string }> = ${JSON.stringify(dic, null, 1)};
`;
writeFileSync(join(frontend, 'src', 'i18n', 'textos-pantallas.ts'), ts);
console.log(`${Object.keys(dic).length} textos en textos-pantallas.ts · ${tocados} archivo(s) con entidades corregidas`);
