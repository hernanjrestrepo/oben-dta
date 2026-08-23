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
];

const ATTACHMENT_PATTERNS: Array<{
  category: ClassificationCategory;
  weight: number;
  pattern: RegExp;
  reason: string;
}> = [
  { category: 'purchase_order', weight: 2, pattern: /\b(po|oc|orden)[-_]?\d/i, reason: 'adjunto con nombre de PO' },
  { category: 'comex', weight: 2, pattern: /lista.?empaque|consumo.?(me|mp)|costos/i, reason: 'adjunto de documento COMEX' },
  { category: 'carrier', weight: 2, pattern: /booking|b[-_]?l\b|manifest/i, reason: 'adjunto de naviera' },
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
