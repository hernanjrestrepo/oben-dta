import { Injectable, Logger } from '@nestjs/common';
import { OllamaService, ChatMessage } from './ollama.service';
import { EvaToolsService } from './tools/eva-tools.service';
import { EVA_TOOLS } from './tools/eva-tool-schemas';

export interface EvaToolTrace {
  tool: string;
  args: Record<string, any>;
  result: unknown;
}

export interface EvaResult {
  model: string;
  reply: string;
  trace: EvaToolTrace[];
  // IDs REALES extraídos de las tools ejecutadas (null si no se crearon).
  orderId: string | null;
  orderNumber: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  iterations: number;
}

// Tope de vueltas del loop para evitar bucles infinitos de tool calling.
const MAX_ITERATIONS = 12;
// Cuántas veces empujamos al modelo a seguir ejecutando si narra en vez de actuar.
const MAX_NUDGES = 4;

const SYSTEM_PROMPT = `Eres EVA, el agente de pedidos de Oben. Procesas instrucciones en lenguaje natural y ejecutas el flujo comercial REAL usando exclusivamente las herramientas disponibles. Nunca inventes datos: si necesitas el id, precio, cupo o stock de algo, consúltalo con una herramienta.

Flujo correcto para un pedido:
1. GetClient(clientId) para confirmar que el cliente existe y su cupo.
2. GetProduct(sku) para cada producto: confirmar que existe, su precio y stock.
3. Calcula el total = suma(precio * cantidad) y llama ValidateCredit(clientId, orderAmount=total).
4. Si el crédito es suficiente, llama CreateOrder(clientId, items) para persistir la orden REAL.
5. Tras crear la orden, llama CreateInvoice(orderId) usando el orderId devuelto por CreateOrder.

Reglas CRÍTICAS de ejecución:
- NUNCA narres lo que vas a hacer. NO escribas frases como "vamos a verificar". En lugar de narrar, LLAMA la herramienta directamente.
- Encadena las herramientas sin detenerte: tras GetClient llama GetProduct; tras GetProduct llama ValidateCredit; tras ValidateCredit (si hay cupo) llama CreateOrder; tras CreateOrder llama CreateInvoice.
- Solo produce una respuesta de texto al final, cuando YA hayas creado la orden y la factura (o cuando exista un bloqueo legítimo).
- Usa el clientId y SKU tal como los menciona el usuario (ej. CLIENT-001, ACME, SKU-001).
- Si GetClient o GetProduct devuelven found=false, detente y explica el problema; no inventes ids.
- Si ValidateCredit indica crédito insuficiente, NO crees la orden; explica el bloqueo y que se escala a un humano.
- Al terminar, responde en español, breve, indicando el número de orden y de factura creados.`;

/**
 * Orquestador de EVA: lenguaje natural -> LLM (Ollama) -> tool calling ->
 * persistencia real en PostgreSQL. Sin regex, sin hardcode, sin IDs ficticios.
 */
@Injectable()
export class EvaOrchestratorService {
  private readonly logger = new Logger(EvaOrchestratorService.name);

  constructor(
    private readonly ollama: OllamaService,
    private readonly tools: EvaToolsService,
  ) {}

  async process(text: string, userId?: string): Promise<EvaResult> {
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
    ];

    const trace: EvaToolTrace[] = [];
    let orderId: string | null = null;
    let orderNumber: string | null = null;
    let invoiceId: string | null = null;
    let invoiceNumber: string | null = null;
    let blocked = false; // bloqueo legítimo: cliente/producto inexistente o sin cupo
    let nudges = 0;
    let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      const assistant = await this.ollama.chat(messages, EVA_TOOLS);
      messages.push(assistant);

      const toolCalls = assistant.tool_calls ?? [];
      if (toolCalls.length === 0) {
        // El modelo no llamó herramientas. Decidir si es fin legítimo o narración.
        const flowComplete = orderId !== null && invoiceId !== null;
        if (flowComplete || blocked || nudges >= MAX_NUDGES) {
          return {
            model: this.ollama.getModelName(),
            reply: assistant.content ?? '',
            trace,
            orderId,
            orderNumber,
            invoiceId,
            invoiceNumber,
            iterations,
          };
        }
        // Narró sin completar el flujo y sin bloqueo: empujarlo a seguir actuando.
        nudges++;
        messages.push({
          role: 'user',
          content:
            'No narres. Aún no has completado el flujo. Llama directamente la siguiente herramienta que corresponda (GetProduct, ValidateCredit, CreateOrder o CreateInvoice) hasta crear la orden y la factura reales.',
        });
        continue;
      }

      // Ejecuta cada tool solicitada contra servicios reales.
      for (const call of toolCalls) {
        const name = call.function.name;
        const args = this.normalizeArgs(call.function.arguments);
        const result = await this.tools.executeTool(name, args, { userId });
        trace.push({ tool: name, args, result });

        // Captura IDs reales devueltos por las tools de creación.
        const r = result as Record<string, any>;
        if (name === 'CreateOrder' && r?.ok) {
          orderId = r.orderId ?? orderId;
          orderNumber = r.orderNumber ?? orderNumber;
        }
        if (name === 'CreateInvoice' && r?.ok) {
          invoiceId = r.invoiceId ?? invoiceId;
          invoiceNumber = r.invoiceNumber ?? invoiceNumber;
        }

        // Detecta bloqueos legítimos: si ocurren, EVA puede detenerse con texto
        // sin que lo empujemos a "seguir" (no hay nada que crear).
        if (
          (name === 'GetClient' || name === 'GetProduct') &&
          r?.found === false
        ) {
          blocked = true;
        }
        if (name === 'ValidateCredit' && r?.isCreditSufficient === false) {
          blocked = true;
        }
        if (
          (name === 'CreateOrder' || name === 'CreateInvoice') &&
          r?.ok === false
        ) {
          blocked = true;
        }

        // Devuelve el resultado al modelo como mensaje de rol 'tool'.
        messages.push({
          role: 'tool',
          tool_name: name,
          content: JSON.stringify(result),
        });
      }
    }

    // Si se agotaron las iteraciones, devolvemos lo logrado sin inventar nada.
    return {
      model: this.ollama.getModelName(),
      reply:
        'EVA alcanzó el máximo de pasos. Revise la traza de herramientas ejecutadas.',
      trace,
      orderId,
      orderNumber,
      invoiceId,
      invoiceNumber,
      iterations,
    };
  }

  // Ollama a veces devuelve arguments como string JSON; normalizamos a objeto.
  private normalizeArgs(args: any): Record<string, any> {
    if (typeof args === 'string') {
      try {
        return JSON.parse(args);
      } catch {
        return {};
      }
    }
    return args ?? {};
  }
}
