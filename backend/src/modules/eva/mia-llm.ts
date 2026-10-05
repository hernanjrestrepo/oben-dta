/**
 * Modelo de MIA: la nube de Ollama (https://ollama.com/v1, API compatible
 * con OpenAI), el mismo servicio que usa EVA BPO con la cuenta de Hernán —
 * sin costo en su plan (decisión de Hernán, 2026-10-05: "olvídate de Haiku").
 * Medido ese día desde el servidor de Oben: gemma4:31b respondió en 0,7 s y
 * pidió la herramienta correcta.
 */
export const MIA_MODEL = process.env.MIA_OLLAMA_MODEL || 'gemma4:31b';
export const MIA_LLM = Symbol('MIA_LLM');

export interface MiaHerramienta {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export interface MiaLlamada {
  id: string;
  name: string;
  input: unknown;
}

/** Mensajes en el formato de chat de OpenAI/Ollama. */
export type MiaMensaje =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface MiaRespuestaLlm {
  texto: string;
  llamadas: MiaLlamada[];
  /** La respuesta se cortó por longitud. */
  cortada: boolean;
}

export interface MiaLlm {
  completar(mensajes: MiaMensaje[], herramientas: MiaHerramienta[]): Promise<MiaRespuestaLlm>;
}

/** Error del proveedor con su status HTTP (401/402 = clave o plan; 429 = demasiadas consultas). */
export class MiaLlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export class OllamaNubeLlm implements MiaLlm {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = process.env.OLLAMA_NUBE_URL || 'https://ollama.com/v1',
    private readonly modelo = MIA_MODEL,
    private readonly timeoutMs = 90_000,
  ) {}

  async completar(mensajes: MiaMensaje[], herramientas: MiaHerramienta[]): Promise<MiaRespuestaLlm> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelo,
          max_tokens: 4000,
          temperature: 0.2,
          messages: mensajes,
          tools: herramientas.map((h) => ({
            type: 'function',
            function: { name: h.name, description: h.description ?? '', parameters: h.input_schema },
          })),
        }),
      });
      const texto = await res.text();
      if (!res.ok) throw new MiaLlmError(`HTTP ${res.status}: ${texto.slice(0, 200)}`, res.status);
      const json = JSON.parse(texto) as {
        choices?: Array<{
          finish_reason?: string;
          message?: { content?: string | null; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> };
        }>;
      };
      const c = json.choices?.[0];
      const llamadas = (c?.message?.tool_calls ?? [])
        .filter((t) => t.function?.name)
        .map((t, i) => ({ id: t.id || `call_${i}`, name: t.function!.name!, input: parsearArgs(t.function!.arguments) }));
      return { texto: (c?.message?.content ?? '').trim(), llamadas, cortada: c?.finish_reason === 'length' };
    } catch (err) {
      if (err instanceof MiaLlmError) throw err;
      throw new MiaLlmError((err as Error).name === 'AbortError' ? 'timeout' : (err as Error).message);
    } finally {
      clearTimeout(timer);
    }
  }
}

function parsearArgs(raw: string | undefined): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
