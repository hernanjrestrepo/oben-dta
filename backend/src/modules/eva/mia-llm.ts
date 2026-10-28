/**
 * Modelo de MIA: cualquier API compatible con OpenAI (`/chat/completions`
 * con function calling). Desde el 2026-10-15 va primero Kimi (Moonshot,
 * kimi-k2.6) y la nube de Ollama (gemma4:31b) queda de respaldo: ese día
 * Ollama respondió 429 "monthly usage limit" y MIA quedó sin servicio
 * (pedido de Hernán: "conecta a MIA a Kimi"). Medido desde el servidor de
 * Oben: kimi-k2.6 pidió la herramienta correcta en ~2 s por vuelta.
 */
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

/** Mensajes en el formato de chat de OpenAI. */
export type MiaMensaje =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface MiaRespuestaLlm {
  texto: string;
  llamadas: MiaLlamada[];
  /** La respuesta se cortó por longitud. */
  cortada: boolean;
  /** Proveedor y modelo que respondió (ej. "kimi:kimi-k2.6"), para la auditoría. */
  modelo?: string;
}

export interface MiaLlm {
  completar(mensajes: MiaMensaje[], herramientas: MiaHerramienta[]): Promise<MiaRespuestaLlm>;
}

/** Error del proveedor con su status HTTP (401/402 = clave o plan; 429 = límite o saldo). */
export class MiaLlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** El proveedor dijo que se acabó el saldo o el cupo (no que haya muchas consultas a la vez). */
export function esSinSaldo(err: unknown): boolean {
  return err instanceof MiaLlmError && (err.status === 402 || /usage limit|quota|billing|balance|credit|insufficient/i.test(err.message));
}

export interface MiaProveedor {
  nombre: 'openrouter' | 'kimi' | 'ollama';
  baseUrl: string;
  modelo: string;
  apiKey: string;
  /** Sin valor no se envía: kimi-k2.6 solo acepta el default ("only 1 is allowed for this model", 2026-08-28). */
  temperatura?: number;
}

/**
 * Modelos de OpenRouter (27-oct, elegidos por precio y calidad con una tarea real de MIA: llamar la herramienta, leer
 * su resultado y responder en español sin inventar). Los alias "~…-latest" enrutan al proveedor más barato.
 * GLM Flash: US$0,038/0,077 por millón de tokens (entrada/salida); DeepSeek V4 Flash de respaldo: US$0,042/0,169.
 */
export const MIA_OPENROUTER_MODELO = '~z-ai/glm-flash-latest';
export const MIA_OPENROUTER_RESPALDO = '~deepseek/deepseek-v4-flash-latest';

/** Proveedores configurados, en orden de preferencia: OpenRouter (modelo barato y su respaldo), Kimi y después Ollama. */
export function proveedoresMia(env: NodeJS.ProcessEnv = process.env): MiaProveedor[] {
  const lista: MiaProveedor[] = [];
  if (env.OPENROUTER_API_KEY) {
    const baseUrl = env.OPENROUTER_URL || 'https://openrouter.ai/api/v1';
    for (const modelo of [env.MIA_OPENROUTER_MODEL || MIA_OPENROUTER_MODELO, env.MIA_OPENROUTER_BACKUP_MODEL || MIA_OPENROUTER_RESPALDO]) {
      if (modelo && modelo !== 'ninguno') lista.push({ nombre: 'openrouter', baseUrl, modelo, apiKey: env.OPENROUTER_API_KEY, temperatura: 0.2 });
    }
  }
  if (env.KIMI_API_KEY) {
    lista.push({
      nombre: 'kimi',
      baseUrl: env.KIMI_URL || 'https://api.moonshot.ai/v1',
      modelo: env.MIA_KIMI_MODEL || 'kimi-k2.6',
      apiKey: env.KIMI_API_KEY,
    });
  }
  if (env.OLLAMA_API_KEY) {
    lista.push({
      nombre: 'ollama',
      baseUrl: env.OLLAMA_NUBE_URL || 'https://ollama.com/v1',
      modelo: env.MIA_OLLAMA_MODEL || 'gemma4:31b',
      apiKey: env.OLLAMA_API_KEY,
      temperatura: 0.2,
    });
  }
  return lista;
}

/** Arma el modelo de MIA con lo configurado; `null` si no hay ninguna clave. */
export function crearMiaLlm(env: NodeJS.ProcessEnv = process.env, alFallar?: (err: unknown) => void): MiaLlm | null {
  const llms = proveedoresMia(env).map((p) => new LlmCompatibleOpenAi(p));
  if (llms.length === 0) return null;
  return llms.length === 1 ? llms[0] : new MiaLlmConRespaldo(llms, alFallar);
}

export class LlmCompatibleOpenAi implements MiaLlm {
  constructor(
    private readonly proveedor: MiaProveedor,
    private readonly timeoutMs = 90_000,
  ) {}

  get modelo(): string {
    return `${this.proveedor.nombre}:${this.proveedor.modelo}`;
  }

  async completar(mensajes: MiaMensaje[], herramientas: MiaHerramienta[]): Promise<MiaRespuestaLlm> {
    const { baseUrl, apiKey, modelo, temperatura } = this.proveedor;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelo,
          max_tokens: 4000,
          ...(temperatura === undefined ? {} : { temperature: temperatura }),
          // Sin razonar: con razonamiento Kimi cobra tokens ocultos en cada vuelta de herramientas
          // (los otros repos ya lo apagan con K2.6). kimi-k3 razona siempre y rechaza "disabled".
          ...(this.proveedor.nombre === 'kimi' && !modelo.startsWith('kimi-k3') ? { thinking: { type: 'disabled' } } : {}),
          messages: mensajes,
          // Sin herramientas (p. ej. traducir) no se manda la lista: algunos proveedores rechazan una vacía.
          ...(herramientas.length
            ? {
                tools: herramientas.map((h) => ({
                  type: 'function',
                  function: { name: h.name, description: h.description ?? '', parameters: h.input_schema },
                })),
              }
            : {}),
        }),
      });
      const texto = await res.text();
      if (!res.ok) throw new MiaLlmError(`${this.modelo} HTTP ${res.status}: ${texto.slice(0, 200)}`, res.status);
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
      return { texto: (c?.message?.content ?? '').trim(), llamadas, cortada: c?.finish_reason === 'length', modelo: this.modelo };
    } catch (err) {
      if (err instanceof MiaLlmError) throw err;
      throw new MiaLlmError(`${this.modelo}: ${(err as Error).name === 'AbortError' ? 'timeout' : (err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Prueba los modelos en orden: si uno falla (sin saldo, clave, caída o
 * timeout), la misma vuelta se repite con el siguiente. Si todos fallan se
 * lanza el error del primero, que es el que hay que arreglar.
 */
export class MiaLlmConRespaldo implements MiaLlm {
  constructor(
    private readonly cadena: MiaLlm[],
    private readonly alFallar: (err: unknown) => void = () => {},
  ) {}

  async completar(mensajes: MiaMensaje[], herramientas: MiaHerramienta[]): Promise<MiaRespuestaLlm> {
    let primero: unknown;
    for (const llm of this.cadena) {
      try {
        return await llm.completar(mensajes, herramientas);
      } catch (err) {
        this.alFallar(err);
        primero ??= err;
      }
    }
    throw primero;
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
