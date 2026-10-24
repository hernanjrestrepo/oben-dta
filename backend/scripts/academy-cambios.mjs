#!/usr/bin/env node
/**
 * Xmart Academy — detecta qué módulos cambiaron en el código después de la última revisión de su contenido.
 * Lee `fuentes` de cada módulo en src/modules/academy/academy-catalogo.ts, pregunta a git la fecha y el commit del
 * último cambio en esas carpetas y escribe src/modules/academy/academy-cambios.ts. Correr antes de cada despliegue:
 *
 *   node backend/scripts/academy-cambios.mjs
 *
 * El panel de fricciones compara esa fecha con `revisado` y marca "contenido por revisar".
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(backend, '..');
const catalogo = readFileSync(join(backend, 'src/modules/academy/academy-catalogo.ts'), 'utf8').replace(/\r\n/g, '\n');

const modulos = [];
const re = /\n  \{\n    key: '([^']+)',[\s\S]*?\n    fuentes: \[([^\]]*)\],/g;
for (let m; (m = re.exec(catalogo)); ) {
  const fuentes = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  modulos.push({ key: m[1], fuentes });
}

const cambios = {};
for (const { key, fuentes } of modulos) {
  if (!fuentes.length) continue;
  const salida = execFileSync('git', ['log', '-1', '--format=%cs%x09%h%x09%s', '--', ...fuentes], { cwd: repo, encoding: 'utf8' }).trim();
  if (!salida) continue;
  const [fecha, commit, ...resto] = salida.split('\t');
  cambios[key] = { fecha, commit, resumen: resto.join(' ').slice(0, 140) };
}

const ts = `// GENERADO por backend/scripts/academy-cambios.mjs — no editar a mano. Último cambio de código de cada módulo.
export const CAMBIOS_DE_CODIGO: Record<string, { fecha: string; commit: string; resumen: string }> = ${JSON.stringify(cambios, null, 2)};
`;
writeFileSync(join(backend, 'src/modules/academy/academy-cambios.ts'), ts);
console.log(`academy-cambios: ${Object.keys(cambios).length} módulos con historial de código (${modulos.length} en el catálogo).`);
