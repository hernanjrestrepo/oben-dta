import {
  ClassificationInput,
  ClassificationResult,
  ClassifierProvider,
} from './classification.types';

/**
 * Contrato único de clasificación. `RulesClassifier` (determinístico,
 * default) y `OllamaClassifier` (LLM local, configurable) lo implementan
 * por igual — la selección es por configuración del tenant
 * (`settings.classifier.provider`), nunca por código.
 */
export interface DocumentClassifier {
  readonly provider: ClassifierProvider;
  classify(input: ClassificationInput): Promise<ClassificationResult>;
}
