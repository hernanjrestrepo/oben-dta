import { Logger } from '@nestjs/common';
import { DocumentClassifier } from '../document-classifier.types';
import {
  CLASSIFICATION_CATEGORIES,
  ClassificationCategory,
  ClassificationInput,
  ClassificationResult,
} from '../classification.types';

export interface OllamaClassifierConfig {
  host: string;
  model: string;
  timeoutMs?: number;
}

interface OllamaGenerateResponse {
  response: string;
}

/**
 * Clasificador Capa 2: LLM local vía Ollama. Mismo contrato que
 * `RulesClassifier` — se activa por configuración del tenant
 * (`settings.classifier.provider = 'ollama'`), sin tocar el resto del
 * sistema. En desarrollo puede apuntar a un modelo liviano; en producción,
 * a un modelo mayor sobre GPU dedicada — solo cambia `host`/`model` en la
 * config del tenant, nunca el código.
 *
 * No queda registrado como singleton en el módulo (a diferencia de
 * `RulesClassifier`): `ClassifierRegistry` construye una instancia por
 * resolución con el host/modelo del tenant, igual que `AdapterRegistry`
 * construye los adapters "real" del Integration Hub.
 */
export class OllamaClassifier implements DocumentClassifier {
  readonly provider = 'ollama' as const;
  private readonly logger = new Logger(OllamaClassifier.name);

  constructor(private readonly config: OllamaClassifierConfig) {}

  async classify(input: ClassificationInput): Promise<ClassificationResult> {
    const prompt = this.buildPrompt(input);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 15000,
    );
    let raw: OllamaGenerateResponse;
    try {
      const res = await fetch(`${this.config.host.replace(/\/$/, '')}/api/generate`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          prompt,
          format: 'json',
          stream: false,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      raw = (await res.json()) as OllamaGenerateResponse;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Ollama no disponible (host=${this.config.host}, model=${this.config.model}): ${message}`,
      );
      throw new Error(
        `ollama_unreachable: no se pudo clasificar con el modelo local (${message}). ` +
          'Verifica settings.classifier.ollamaHost/ollamaModel del tenant o cambia classifier.provider a "rules".',
      );
    } finally {
      clearTimeout(timeout);
    }

    return this.parseModelOutput(raw.response);
  }

  private buildPrompt(input: ClassificationInput): string {
    const attachments = (input.attachments ?? [])
      .map((a) => a.filename)
      .join(', ') || 'ninguno';
    return [
      'Clasifica el siguiente correo de negocio en UNA sola categoría de esta lista exacta:',
      CLASSIFICATION_CATEGORIES.join(', '),
      '',
      'Responde SOLO un JSON con esta forma exacta: {"category": "...", "confidence": 0.0-1.0, "reasons": ["..."]}',
      '',
      `Remitente: ${input.from}`,
      `Cliente conocido: ${input.knownClient ? `sí, ${input.knownClient.name} (activo=${input.knownClient.isActive})` : 'no'}`,
      `Asunto: ${input.subject}`,
      `Adjuntos: ${attachments}`,
      'Cuerpo:',
      input.body,
    ].join('\n');
  }

  private parseModelOutput(response: string): ClassificationResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(response);
    } catch {
      throw new Error(
        `ollama_invalid_response: el modelo no devolvió JSON válido: ${response.slice(0, 200)}`,
      );
    }
    const obj = parsed as Record<string, unknown>;
    const category = CLASSIFICATION_CATEGORIES.includes(
      obj.category as ClassificationCategory,
    )
      ? (obj.category as ClassificationCategory)
      : 'unknown';
    const confidence =
      typeof obj.confidence === 'number'
        ? Math.max(0, Math.min(1, obj.confidence))
        : 0.5;
    const reasons = Array.isArray(obj.reasons)
      ? obj.reasons.map((r) => String(r))
      : ['clasificado por modelo local (sin razones explícitas)'];
    return { category, confidence, reasons, provider: this.provider };
  }
}
