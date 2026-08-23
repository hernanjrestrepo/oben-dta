import { Injectable } from '@nestjs/common';
import { Product } from '../../entities/product.entity';
import { PurchaseOrderExtractedItem } from '../../entities/purchase-order-document.entity';

export interface ExtractedPurchaseOrder {
  poNumber: string | null;
  poDate: Date | null;
  reference: string | null;
  items: PurchaseOrderExtractedItem[];
  paymentTerms: string | null;
  incoterm: string | null;
  observations: string | null;
  contactPerson: string | null;
}

const INCOTERMS = [
  'EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP',
];

/**
 * Extracción determinística (Capa 1, igual espíritu que `RulesClassifier` y
 * el `parseItemsFromCatalog` de Cotizaciones) de los campos mínimos que pide
 * WO-017. No es NLP — son patrones sobre texto libre; documentado así a
 * propósito, no se presenta como más de lo que es.
 */
@Injectable()
export class PurchaseOrderExtractor {
  extract(body: string, catalog: Product[]): ExtractedPurchaseOrder {
    const normalized = body.replace(/\r\n/g, '\n');

    // El grupo capturado debe EMPEZAR con un dígito: si no, "orden de compra"
    // como prefijo (frecuente en el mismo correo, ej. "Adjuntamos orden de
    // compra PO-108149") se autoemparejaría y devolvería "PO-108149" entero
    // en vez de "108149", porque letras y guiones también caben en
    // [A-Z0-9-]. Exigir dígito inicial fuerza el backtracking a la posición
    // correcta ("po"/"oc" + número).
    const poNumberMatch = normalized.match(
      /\b(?:po|orden\s+de\s+compra|oc)[-\s#:]*([0-9][A-Z0-9-]{2,})/i,
    );
    const poNumber = poNumberMatch ? poNumberMatch[1].toUpperCase() : null;

    const dateMatch = normalized.match(
      /\b(\d{4}-\d{2}-\d{2})\b|\b(\d{1,2}\/\d{1,2}\/\d{4})\b/,
    );
    const poDate = dateMatch ? this.parseDate(dateMatch[0]) : null;

    const referenceMatch = normalized.match(/referencia[:\s]+([^\n]+)/i);
    const reference = referenceMatch ? referenceMatch[1].trim() : null;

    const paymentMatch = normalized.match(
      /(?:condici[oó]n(?:es)?\s+de\s+pago|forma\s+de\s+pago|payment\s+terms?)[:\s]+([^\n]+)/i,
    );
    const paymentTerms = paymentMatch ? paymentMatch[1].trim() : null;

    const incotermMatch = normalized.match(
      new RegExp(`\\b(${INCOTERMS.join('|')})\\b`, 'i'),
    );
    const incoterm = incotermMatch ? incotermMatch[1].toUpperCase() : null;

    const observationsMatch = normalized.match(
      /(?:observaci[oó]n(?:es)?|notes?)[:\s]+([^\n]+)/i,
    );
    const observations = observationsMatch ? observationsMatch[1].trim() : null;

    const contactMatch = normalized.match(
      /(?:atenci[oó]n|contacto|attn\.?)[:\s]+([^\n,]+)/i,
    );
    const contactPerson = contactMatch ? contactMatch[1].trim() : null;

    const items = this.extractItems(normalized, catalog);

    return {
      poNumber,
      poDate,
      reference,
      items,
      paymentTerms,
      incoterm,
      observations,
      contactPerson,
    };
  }

  /** Mismo patrón que `QuotesService.parseItemsFromCatalog`: SKU/nombre + cantidad numérica precedente. */
  private extractItems(
    text: string,
    catalog: Product[],
  ): PurchaseOrderExtractedItem[] {
    const items: PurchaseOrderExtractedItem[] = [];
    const seen = new Set<string>();

    for (const product of catalog) {
      const needles = [product.sku, product.name].filter(Boolean);
      for (const needle of needles) {
        const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(
          `(\\d[\\d.,]*)\\s*(?:kg|ton|toneladas?|unidades?|und|rollos?|x)?\\s*(?:de\\s+)?${escaped}`,
          'i',
        );
        const m = text.match(re);
        if (m && !seen.has(product.id)) {
          const qty = parseInt(m[1].replace(/[.,]/g, ''), 10);
          if (qty > 0) {
            items.push({ raw: needle, quantity: qty, productId: product.id });
            seen.add(product.id);
          }
          break;
        }
      }
    }
    return items;
  }

  private parseDate(raw: string): Date | null {
    const iso = raw.match(/^\d{4}-\d{2}-\d{2}$/);
    if (iso) return new Date(`${raw}T00:00:00.000Z`);
    const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
      const [, d, m, y] = dmy;
      return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00.000Z`);
    }
    return null;
  }
}
