import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ToolCall {
  function: { name: string; arguments: Record<string, any> };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_name?: string;
}

@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);
  private readonly ollamaUrl: string;
  private readonly model: string;

  constructor(private configService: ConfigService) {
    this.ollamaUrl = this.configService.get(
      'OLLAMA_URL',
      'http://localhost:11434',
    );
    // El modelo se decide por benchmark y se inyecta vía OLLAMA_MODEL.
    // El default aquí es solo un placeholder; producción usa la env var.
    this.model = this.configService.get('OLLAMA_MODEL', 'qwen2.5:7b-instruct');
  }

  getModelName(): string {
    return this.model;
  }

  /**
   * Chat con soporte de tool calling (endpoint /api/chat de Ollama).
   * Devuelve el mensaje del asistente, que puede incluir tool_calls.
   * No hace fallback simulado: si Ollama no responde, lanza — EVA real no inventa.
   */
  async chat(
    messages: ChatMessage[],
    tools?: readonly unknown[],
  ): Promise<ChatMessage> {
    const response = await fetch(`${this.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        tools,
        stream: false,
        options: { temperature: 0 },
      }),
    });

    if (!response.ok) {
      throw new HttpException(
        `Ollama chat error: ${response.status} ${response.statusText}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const data = await response.json();
    return data.message as ChatMessage;
  }

  /**
   * Genera un embedding local con el modelo de embeddings (nomic-embed-text).
   * Usado por ADÁN para indexación y búsqueda semántica. 100% local.
   */
  async embed(text: string): Promise<number[]> {
    const model = this.configService.get(
      'OLLAMA_EMBED_MODEL',
      'nomic-embed-text',
    );
    const response = await fetch(`${this.ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
    });
    if (!response.ok) {
      throw new HttpException(
        `Ollama embeddings error: ${response.status} ${response.statusText}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const data = await response.json();
    return data.embedding as number[];
  }

  getEmbedModelName(): string {
    return this.configService.get('OLLAMA_EMBED_MODEL', 'nomic-embed-text');
  }

  /**
   * Chat simple sin herramientas (usado por ADÁN para responder con contexto RAG).
   */
  async chatSimple(messages: ChatMessage[]): Promise<string> {
    const msg = await this.chat(messages);
    return msg.content ?? '';
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
