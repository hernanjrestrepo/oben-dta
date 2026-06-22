import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ParsedOrderInput {
  clientId: string;
  items: Array<{
    sku: string;
    qty: number;
  }>;
  confidence: number;
  rawText: string;
}

@Injectable()
export class OllamaService {
  private readonly ollamaUrl: string;
  private readonly model: string;

  constructor(private configService: ConfigService) {
    this.ollamaUrl = this.configService.get(
      'OLLAMA_URL',
      'http://localhost:11434',
    );
    this.model = this.configService.get('OLLAMA_MODEL', 'llama3.2:3b');
  }

  async parseOrder(text: string): Promise<ParsedOrderInput> {
    const prompt = this.buildPrompt(text);

    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          format: 'json',
        }),
      });

      if (!response.ok) {
        throw new HttpException(
          `Ollama error: ${response.statusText}`,
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      const data = await response.json();
      const parsed = JSON.parse(data.response);

      return {
        clientId: parsed.clientId || 'CLIENT-001',
        items: parsed.items || [],
        confidence: parsed.confidence || 0.5,
        rawText: text,
      };
    } catch (error) {
      // Fallback a regex si Ollama no está disponible
      console.warn(
        'Ollama no disponible, usando parser fallback:',
        error.message,
      );
      return this.fallbackParse(text);
    }
  }

  private buildPrompt(text: string): string {
    return `Eres un asistente de IA para un sistema ERP de manufactura. Tu tarea es interpretar pedidos de clientes escritos en español y extraer la información relevante.

Texto del cliente: "${text}"

Extrae la información en este formato JSON exacto:
{
  "clientId": "CLIENT-001",
  "items": [
    {"sku": "SKU-001", "qty": 10}
  ],
  "confidence": 0.95
}

Reglas:
- clientId: Usa "CLIENT-001" si no se menciona un cliente específico
- sku: Extrae el código SKU del producto (formato SKU-###)
- qty: Extrae la cantidad solicitada (número entero)
- confidence: Confianza del parseo (0.0 a 1.0)
- Si no puedes interpretar el pedido, devuelve items vacíos y confidence 0

Responde ÚNICAMENTE con el JSON, sin explicaciones.`;
  }

  private fallbackParse(text: string): ParsedOrderInput {
    const normalized = text.toLowerCase().trim();
    const matches = normalized.matchAll(
      /(?:quiero|necesito|pedir|solicito|ordena)\s+(\d+)\s+(sku-\d+)/gi,
    );

    const items: Array<{ sku: string; qty: number }> = [];
    for (const match of matches) {
      items.push({
        qty: parseInt(match[1], 10),
        sku: match[2].toUpperCase(),
      });
    }

    return {
      clientId: 'CLIENT-001',
      items,
      confidence: items.length > 0 ? 0.7 : 0,
      rawText: text,
    };
  }

  async healthCheck(): Promise<{ status: string; model: string }> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`, {
        method: 'GET',
      });

      if (!response.ok) {
        return { status: 'unavailable', model: this.model };
      }

      const data = await response.json();
      const modelAvailable = data.models?.some(
        (m: any) => m.name === this.model,
      );

      return {
        status: modelAvailable ? 'ready' : 'model_not_found',
        model: this.model,
      };
    } catch {
      return { status: 'offline', model: this.model };
    }
  }
}
