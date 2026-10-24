#!/usr/bin/env node
/**
 * Envuelve en t('…') los textos visibles de una o varias pantallas (texto JSX y atributos title, placeholder,
 * aria-label, label, subtitle, alt) y agrega `const t = useT();` al componente que los usa. Escribe la lista de
 * textos nuevos en scripts/i18n-nuevos.json para traducirlos.
 *
 *   node scripts/i18n-envolver.mjs "src/app/(app)/facturacion" src/app/(app)/comercial/page.tsx
 *
 * Reglas: solo textos con letras (no números, códigos ni datos); no toca lo que ya está en t(); los textos se
 * normalizan (espacios) para que la clave coincida con el diccionario.
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const frontend = join(dirname(fileURLToPath(import.meta.url)), '..');
const rutas = process.argv.slice(2);
const archivos = [];
const recorrer = (p) => {
  if (statSync(p).isDirectory()) for (const n of readdirSync(p)) recorrer(join(p, n));
  else if (p.endsWith('.tsx')) archivos.push(p);
};
for (const r of rutas) recorrer(join(frontend, r));

const ATRIBUTOS = new Set(['title', 'placeholder', 'aria-label', 'label', 'subtitle', 'alt', 'hint']);
const CON_LETRAS = /[A-Za-zÁÉÍÓÚáéíóúÑñ]{2}/;
// Textos que son marcas, siglas o datos: no se traducen.
const NO_TRADUCIR = /^(OBEN XMART|Oben Xmart|Oben Xmart by Paradixe|MIA|OBEN MAS|COMEX|PF|OV|OC|USD|US\$|kg|FOB|CIF|HMF|ISF|NCM|TRM|ERP|CUFE|DIAN|ID|SKU|Excel|PDF|Word|CSV)$/;
const nuevos = new Set();
const esc = (t) => t.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function esComponente(n) {
  const nombre =
    ts.isFunctionDeclaration(n) && n.name ? n.name.text : (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && ts.isVariableDeclaration(n.parent) && ts.isIdentifier(n.parent.name) ? n.parent.name.text : null;
  return !!nombre && /^[A-Z]/.test(nombre) && (n.body && ts.isBlock(n.body));
}

for (const archivo of archivos) {
  let fuente = readFileSync(archivo, 'utf8');
  const sf = ts.createSourceFile(archivo, fuente, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const cambios = []; // { ini, fin, texto }
  const componentes = new Set(); // nodos función que necesitan t

  const componenteDe = (n) => {
    for (let p = n.parent; p; p = p.parent) if ((ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && esComponente(p)) return p;
    return null;
  };
  const yaEnT = (n) => {
    for (let p = n.parent; p && !ts.isJsxElement(p); p = p.parent) if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === 't') return true;
    return false;
  };

  const visitar = (n) => {
    if (ts.isJsxText(n)) {
      const crudo = n.getFullText(sf);
      const limpio = crudo.replace(/\s+/g, ' ').trim();
      if (limpio && CON_LETRAS.test(limpio) && !NO_TRADUCIR.test(limpio)) {
        const comp = componenteDe(n);
        if (comp) {
          const iniEsp = crudo.match(/^\s*/)[0];
          const finEsp = crudo.match(/\s*$/)[0];
          // Conserva un espacio a cada lado si lo había en la misma línea (separa de {expresiones} vecinas).
          const antes = iniEsp && !iniEsp.includes('\n') ? ' ' : iniEsp.includes('\n') ? iniEsp : '';
          const despues = finEsp && !finEsp.includes('\n') ? ' ' : finEsp.includes('\n') ? finEsp : '';
          const izq = antes === ' ' ? "{' '}" : antes;
          const der = despues === ' ' ? "{' '}" : despues;
          cambios.push({ ini: n.getFullStart(), fin: n.getEnd(), texto: `${izq}{t('${esc(limpio)}')}${der}` });
          componentes.add(comp);
          nuevos.add(limpio);
        }
      }
    } else if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer) && ATRIBUTOS.has(n.name.getText(sf))) {
      const v = n.initializer.text.replace(/\s+/g, ' ').trim();
      if (v && CON_LETRAS.test(v) && !NO_TRADUCIR.test(v)) {
        const comp = componenteDe(n);
        if (comp) {
          cambios.push({ ini: n.initializer.getStart(sf), fin: n.initializer.getEnd(), texto: `{t('${esc(v)}')}` });
          componentes.add(comp);
          nuevos.add(v);
        }
      }
    } else if (ts.isJsxExpression(n) && n.expression && ts.isStringLiteral(n.expression) && ts.isJsxAttribute(n.parent) && ATRIBUTOS.has(n.parent.name.getText(sf))) {
      const v = n.expression.text.replace(/\s+/g, ' ').trim();
      if (v && CON_LETRAS.test(v) && !NO_TRADUCIR.test(v) && !yaEnT(n)) {
        const comp = componenteDe(n);
        if (comp) {
          cambios.push({ ini: n.expression.getStart(sf), fin: n.expression.getEnd(), texto: `t('${esc(v)}')` });
          componentes.add(comp);
          nuevos.add(v);
        }
      }
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);
  if (!cambios.length) continue;

  // `const t = useT();` al inicio de cada componente que no lo tenga.
  for (const comp of componentes) {
    const cuerpo = comp.body;
    if (/\bconst t = useT\(\)/.test(cuerpo.getText(sf))) continue;
    cambios.push({ ini: cuerpo.getStart(sf) + 1, fin: cuerpo.getStart(sf) + 1, texto: '\n  const t = useT();' });
  }
  cambios.sort((a, b) => b.ini - a.ini);
  for (const c of cambios) fuente = fuente.slice(0, c.ini) + c.texto + fuente.slice(c.fin);
  if (!/from '@\/i18n\/idioma'/.test(fuente)) {
    const i = fuente.indexOf('\nimport ');
    fuente = `${fuente.slice(0, i)}\nimport { useT } from '@/i18n/idioma';${fuente.slice(i)}`;
  }
  writeFileSync(archivo, fuente);
  console.log(`${archivo.replace(frontend, '')}: ${cambios.length} cambios`);
}

const salida = join(frontend, 'scripts', 'i18n-nuevos.json');
const previos = existsSync(salida) ? JSON.parse(readFileSync(salida, 'utf8')) : [];
writeFileSync(salida, JSON.stringify([...new Set([...previos, ...nuevos])], null, 1));
console.log(`${nuevos.size} textos encontrados → scripts/i18n-nuevos.json`);
