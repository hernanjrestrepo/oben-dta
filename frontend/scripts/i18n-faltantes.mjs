#!/usr/bin/env node
/**
 * Lista los textos envueltos en t('…') que no tienen traducción en src/i18n/textos.ts (salen en español).
 *   node scripts/i18n-faltantes.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const diccionario = readFileSync(join(raiz, 'i18n', 'textos.ts'), 'utf8');
const claves = new Set();
for (const m of diccionario.matchAll(/^\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([\wÁÉÍÓÚáéíóúñÑ]+)): \{ ?en:/gm)) claves.add((m[1] ?? m[2] ?? m[3]).replace(/\\'/g, "'"));
for (const m of diccionario.matchAll(/^\s*'((?:[^'\\]|\\.)*)': \{\s*$/gm)) claves.add(m[1].replace(/\\'/g, "'"));

const archivos = [];
const recorrer = (d) => {
  for (const n of readdirSync(d)) {
    const f = join(d, n);
    if (statSync(f).isDirectory()) recorrer(f);
    else if (/\.tsx?$/.test(n) && !f.includes(`${join('i18n', 'textos.ts')}`)) archivos.push(f);
  }
};
recorrer(raiz);

const faltan = new Map();
for (const f of archivos) {
  const s = readFileSync(f, 'utf8');
  if (!/useT\(\)|traducir\(/.test(s)) continue;
  for (const m of s.matchAll(/\bt\('((?:[^'\\]|\\.)+)'/g)) {
    const k = m[1].replace(/\\'/g, "'");
    if (!claves.has(k)) faltan.set(k, relative(raiz, f));
  }
}
for (const [k, f] of faltan) console.log(`${f}: ${k}`);
console.log(`\n${faltan.size} texto(s) sin traducción · ${claves.size} en el diccionario`);
process.exit(0);
