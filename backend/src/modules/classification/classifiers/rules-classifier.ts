import { Injectable } from '@nestjs/common';
import { DocumentClassifier } from '../document-classifier.types';
import {
  ClassificationCategory,
  ClassificationInput,
  ClassificationResult,
} from '../classification.types';

interface CategorySignal {
  category: ClassificationCategory;
  weight: number;
  reason: string;
}

// Patrones sobre asunto+cuerpo. Cada match suma evidencia — la clasificación
// nunca depende de un único patrón de asunto (requisito explícito de
// WO-017: "No utilizar únicamente reglas por asunto").
const TEXT_PATTERNS: Array<{
  category: ClassificationCategory;
  weight: number;
  pattern: RegExp;
  reason: string;
}> = [
  // Orden de Compra
  { category: 'purchase_order', weight: 3, pattern: /\bPO[-\s#:]*\d{3,}/i, reason: 'número de PO detectado' },
  { category: 'purchase_order', weight: 3, pattern: /orden(?:es)?\s+de\s+compra/i, reason: '"orden de compra" en el texto' },
  { category: 'purchase_order', weight: 3, pattern: /purchase\s+order/i, reason: '"purchase order" en el texto' },
  { category: 'purchase_order', weight: 2, pattern: /confirmamos\s+(?:la\s+)?(?:orden|compra|pedido)/i, reason: 'confirmación de pedido' },
  { category: 'purchase_order', weight: 1, pattern: /\boc[-\s#:]*\d{3,}/i, reason: 'referencia "OC-####"' },

  // Solicitud de cotización
  { category: 'quote_request', weight: 3, pattern: /solicit(?:ud|amos|o)\s+.*cotizaci[oó]n/i, reason: 'solicitud de cotización' },
  { category: 'quote_request', weight: 3, pattern: /\brfq\b/i, reason: 'RFQ (request for quotation)' },
  { category: 'quote_request', weight: 2, pattern: /favor\s+cotizar|podr[ií]an\s+cotizar/i, reason: 'pide cotizar' },
  // Encontrado en vivo el 2026-08-26: "necesito una cotización" es una
  // forma real y natural de pedir cotizar, distinta de "solicito/solicitud"
  // — no calzaba con ningún patrón y caía en "unknown" sin ningún flujo.
  { category: 'quote_request', weight: 3, pattern: /necesit(?:o|amos)\s+.*cotiza(?:r|ci[oó]n)/i, reason: 'necesita cotización/cotizar' },
  { category: 'quote_request', weight: 3, pattern: /quisiera\s+.*cotiza(?:r|ci[oó]n)/i, reason: 'quisiera cotización/cotizar' },
  { category: 'quote_request', weight: 1, pattern: /precio\s+de|lista\s+de\s+precios/i, reason: 'pregunta por precio' },

  // Naviera
  { category: 'carrier', weight: 3, pattern: /\b(bill\s+of\s+lading|b\/l|booking\s+confirmation)\b/i, reason: 'documento de naviera (BL/booking)' },
  { category: 'carrier', weight: 3, pattern: /\b(maersk|msc|hapag[-\s]?lloyd|cma\s*cgm|evergreen|cosco|one\s+line)\b/i, reason: 'naviera conocida mencionada' },
  { category: 'carrier', weight: 2, pattern: /flete\s+mar[ií]timo|freight\s+rate|tarifa\s+naviera/i, reason: 'tarifa de flete' },
  { category: 'carrier', weight: 1, pattern: /\bcontenedor(?:es)?\b|\bvessel\b/i, reason: 'menciona contenedor/vessel' },

  // COMEX
  { category: 'comex', weight: 3, pattern: /lista\s+de\s+empaque/i, reason: '"lista de empaque"' },
  { category: 'comex', weight: 3, pattern: /liquidaci[oó]n\s+de\s+exportaci[oó]n/i, reason: 'liquidación de exportación' },
  { category: 'comex', weight: 2, pattern: /consumo\s+(?:me|mp)\b/i, reason: 'documento de consumo ME/MP' },
  { category: 'comex', weight: 1, pattern: /\bdian\b|aduana/i, reason: 'referencia DIAN/aduana' },

  // Maestro de tarifas de flete (actualización periódica del forwarder,
  // NO es una solicitud de cotización de cliente — WO-018, ver
  // FreightRateImportService). El asunto real que envía el forwarder suele
  // ser poco descriptivo (a veces solo el nombre del archivo reenviado),
  // así que el adjunto (ver ATTACHMENT_PATTERNS) pesa más que el texto aquí.
  { category: 'freight_rates', weight: 3, pattern: /inland\s+(?:trucking\s+)?rates?/i, reason: 'tarifas de flete terrestre (inland rates)' },
  { category: 'freight_rates', weight: 2, pattern: /trucking\s+rates?/i, reason: 'tarifas de trucking' },
  { category: 'freight_rates', weight: 2, pattern: /\bleg\s*\d+\b.*rates?/i, reason: 'tarifas por tramo (Leg N)' },
  { category: 'freight_rates', weight: 1, pattern: /\bshapiro\b/i, reason: 'menciona forwarder Shapiro' },
];

// Frases clave por categoría para el segundo pase tolerante a errores de
// tipeo (ver `fuzzyCategoryScore` más abajo). Solo cubre las frases núcleo
// que ya identifican cada categoría en TEXT_PATTERNS — no duplica todo el
// catálogo de patrones, solo lo mínimo para recuperar un correo real con
// errores de tipeo (encontrado en vivo el 2026-08-26: "Soliictud de
// Cotizacxion" no calzaba con ningún patrón exacto).
const FUZZY_PHRASES: Array<{
  category: ClassificationCategory;
  weight: number;
  words: string[];
  reason: string;
}> = [
  { category: 'quote_request', weight: 3, words: ['solicitud', 'cotizacion'], reason: 'solicitud de cotización (aproximado, con errores de tipeo)' },
  { category: 'purchase_order', weight: 3, words: ['orden', 'compra'], reason: '"orden de compra" (aproximado, con errores de tipeo)' },
  { category: 'purchase_order', weight: 3, words: ['purchase', 'order'], reason: '"purchase order" (aproximado, con errores de tipeo)' },
  { category: 'comex', weight: 3, words: ['lista', 'empaque'], reason: '"lista de empaque" (aproximado, con errores de tipeo)' },
];

function normalizeWord(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

/** Tolerancia proporcional al largo de la palabra — evita falsos positivos en palabras cortas. */
function fuzzyWordMatches(haystackWord: string, targetWord: string): boolean {
  if (haystackWord === targetWord) return true;
  if (targetWord.length < 4) return false;
  const maxDistance = targetWord.length <= 6 ? 1 : 2;
  return levenshtein(haystackWord, targetWord) <= maxDistance;
}

function fuzzyCategoryScore(haystack: string): CategorySignal[] {
  const words = normalizeWord(haystack).split(/[^a-z0-9]+/).filter(Boolean);
  const signals: CategorySignal[] = [];
  for (const phrase of FUZZY_PHRASES) {
    const allWordsPresent = phrase.words.every((target) =>
      words.some((w) => fuzzyWordMatches(w, target)),
    );
    if (allWordsPresent) {
      signals.push({ category: phrase.category, weight: phrase.weight, reason: phrase.reason });
    }
  }
  return signals;
}

const ATTACHMENT_PATTERNS: Array<{
  category: ClassificationCategory;
  weight: number;
  pattern: RegExp;
  reason: string;
}> = [
  { category: 'purchase_order', weight: 2, pattern: /\b(po|oc|orden)[-_]?\d/i, reason: 'adjunto con nombre de PO' },
  { category: 'comex', weight: 2, pattern: /lista.?empaque|consumo.?(me|mp)|costos/i, reason: 'adjunto de documento COMEX' },
  { category: 'carrier', weight: 2, pattern: /booking|b[-_]?l\b|manifest/i, reason: 'adjunto de naviera' },
  { category: 'freight_rates', weight: 3, pattern: /rates?.*20\d{2}.*\.xlsx?$/i, reason: 'adjunto de tarifas con año (xlsx)' },
  { category: 'freight_rates', weight: 2, pattern: /\brates?\b.*\.xlsx?$/i, reason: 'adjunto de tarifas (xlsx)' },
];

/**
 * Clasificador Capa 1: reglas determinísticas sobre asunto + cuerpo +
 * adjuntos + contexto del cliente. Rápido, gratis, 100% offline y
 * reproducible — el proveedor por defecto (`classifier_provider: rules`).
 * No es IA/ML; es el piso determinístico sobre el que `OllamaClassifier`
 * (mismo contrato `DocumentClassifier`) se activa por configuración cuando
 * el tenant tiene un modelo local disponible.
 */
@Injectable()
export class RulesClassifier implements DocumentClassifier {
  readonly provider = 'rules' as const;

  async classify(input: ClassificationInput): Promise<ClassificationResult> {
    const haystack = `${input.subject}\n${input.body}`;
    const scores = new Map<ClassificationCategory, number>();
    const reasons = new Map<ClassificationCategory, string[]>();

    const addSignal = (s: CategorySignal) => {
      scores.set(s.category, (scores.get(s.category) ?? 0) + s.weight);
      const list = reasons.get(s.category) ?? [];
      list.push(s.reason);
      reasons.set(s.category, list);
    };

    for (const p of TEXT_PATTERNS) {
      if (p.pattern.test(haystack)) {
        addSignal({ category: p.category, weight: p.weight, reason: p.reason });
      }
    }

    // Segundo pase, tolerante a errores de tipeo: solo aporta a categorías
    // que los patrones exactos no encontraron — no infla la confianza de un
    // correo ya bien escrito, solo recupera uno mal escrito que de otra
    // forma caería en "unknown" sin ningún flujo automático.
    for (const signal of fuzzyCategoryScore(haystack)) {
      if ((scores.get(signal.category) ?? 0) === 0) {
        addSignal(signal);
      }
    }

    for (const attachment of input.attachments ?? []) {
      for (const p of ATTACHMENT_PATTERNS) {
        if (p.pattern.test(attachment.filename)) {
          addSignal({
            category: p.category,
            weight: p.weight,
            reason: `${p.reason} (${attachment.filename})`,
          });
        }
      }
    }
    // Contexto del cliente: un remitente ya conocido como cliente activo
    // reduce la probabilidad de que sea correo de naviera/COMEX (esos
    // suelen venir de proveedores logísticos, no de clientes) — refuerzo
    // leve, no decisivo por sí solo.
    if (input.knownClient?.isActive) {
      if ((scores.get('purchase_order') ?? 0) > 0) {
        addSignal({ category: 'purchase_order', weight: 1, reason: `remitente es cliente activo conocido (${input.knownClient.name})` });
      }
      if ((scores.get('quote_request') ?? 0) > 0) {
        addSignal({ category: 'quote_request', weight: 1, reason: `remitente es cliente activo conocido (${input.knownClient.name})` });
      }
    }

    let best: ClassificationCategory = 'unknown';
    let bestScore = 0;
    for (const [category, score] of scores.entries()) {
      if (score > bestScore) {
        best = category;
        bestScore = score;
      }
    }

    if (best === 'unknown' || bestScore === 0) {
      return {
        category: 'unknown',
        confidence: 0.2,
        reasons: ['sin patrones reconocidos en asunto, cuerpo o adjuntos'],
        provider: this.provider,
      };
    }

    const confidence = bestScore >= 5 ? 0.9 : bestScore >= 3 ? 0.7 : 0.4;
    return {
      category: best,
      confidence,
      reasons: reasons.get(best) ?? [],
      provider: this.provider,
    };
  }
}
