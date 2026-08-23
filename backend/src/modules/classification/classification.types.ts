/** Categorías de correo entrante que el clasificador puede distinguir. */
export const CLASSIFICATION_CATEGORIES = [
  'purchase_order',
  'quote_request',
  'carrier',
  'comex',
  'unknown',
] as const;

export type ClassificationCategory = (typeof CLASSIFICATION_CATEGORIES)[number];

/** Proveedores de clasificación intercambiables — ver DocumentClassifier. */
export const CLASSIFIER_PROVIDERS = ['rules', 'ollama'] as const;
export type ClassifierProvider = (typeof CLASSIFIER_PROVIDERS)[number];

export interface ClassificationAttachment {
  filename: string;
  mimeType?: string;
}

export interface ClassificationInput {
  from: string;
  subject: string;
  body: string;
  attachments?: ClassificationAttachment[];
  /** Contexto del cliente ya conocido por el sistema (no solo el correo aislado). */
  knownClient?: { isActive: boolean; name: string } | null;
}

export interface ClassificationResult {
  category: ClassificationCategory;
  /** 0..1. El motor de reglas produce confianzas discretas (0.4/0.7/0.9); Ollama, continuas. */
  confidence: number;
  reasons: string[];
  provider: ClassifierProvider;
}
