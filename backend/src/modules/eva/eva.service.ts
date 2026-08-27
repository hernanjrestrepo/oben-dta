import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../entities/product.entity';
import { QuotesService } from '../quotes/quotes.service';
import { TenantContext } from '../../common/tenant/tenant-context.service';

interface KimiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: KimiToolCall[];
  tool_call_id?: string;
}

interface KimiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface EvaChatResult {
  reply: string;
  action?: { type: string; data: unknown };
}

const KIMI_MODEL = 'kimi-k2.6';
const KIMI_BASE_URL = 'https://api.moonshot.ai/v1';

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'crear_cotizacion',
      description:
        'Genera una cotizacion real en Oben Xmart para un cliente registrado, a partir de una descripcion en texto libre de los productos y cantidades pedidos. Usa esta herramienta cuando el usuario pida cotizar/pedir algo para un cliente identificable por correo.',
      parameters: {
        type: 'object',
        properties: {
          clienteEmail: {
            type: 'string',
            description: 'Correo electronico del cliente (debe pertenecer a un dominio de cliente ya registrado en Oben Xmart).',
          },
          descripcionPedido: {
            type: 'string',
            description: 'Descripcion en texto libre de los productos y cantidades, ej: "500 kg de BOPP Transparente y 10 kg de BOPA".',
          },
        },
        required: ['clienteEmail', 'descripcionPedido'],
      },
    },
  },
];

/**
 * EVA: asistente conversacional real de Oben Xmart. NO es un chatbot generico
 * — usa function calling real contra Kimi (kimi-k2.6) para decidir si una
 * instruccion en lenguaje natural debe disparar una accion real de negocio, y
 * si es asi, la ejecuta contra el mismo QuotesService ya probado en
 * produccion (mismo camino que un correo real: identifica cliente por
 * dominio, matchea catalogo real, genera cotizacion, PDF y envio). La
 * respuesta final para acciones NUNCA se le pide a Kimi que la redacte libre
 * — se construye desde el resultado real de la operacion, para no arriesgar
 * que la IA "narre" un exito que no ocurrio.
 */
@Injectable()
export class EvaService {
  private readonly logger = new Logger(EvaService.name);

  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly quotesService: QuotesService,
    private readonly ctx: TenantContext,
  ) {}

  async chat(message: string): Promise<EvaChatResult> {
    const apiKey = process.env.KIMI_API_KEY;
    if (!apiKey) {
      return {
        reply:
          'EVA no está configurada todavía en este ambiente (falta KIMI_API_KEY). Avisa al equipo técnico.',
      };
    }

    const catalog = await this.products.find({
      where: { isActive: true, tenantId: this.ctx.tenantId },
    });
    const catalogText = catalog
      .map((p) => `- ${p.sku}: ${p.name} — $${Number(p.price).toLocaleString('es-CO')} COP/kg`)
      .join('\n');

    const systemPrompt = `Eres EVA, la asistente de operaciones de Oben Xmart (plataforma de Oben Group, exportaciones e industria, construida por Paradixe).

Catálogo real activo de productos:
${catalogText || '(sin productos activos)'}

Reglas:
- Si el usuario pide cotizar, pedir o comprar algo para un cliente identificado por correo, usa la herramienta crear_cotizacion.
- Si el usuario solo hace una pregunta general (proceso, política, cómo funciona algo), respóndela de forma breve y honesta. Si no sabes un dato específico de Oben con certeza, dilo claramente — nunca inventes cifras, políticas ni compromisos.
- Responde siempre en español, tono profesional y directo.`;

    const messages: KimiMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ];

    let completion;
    try {
      completion = await this.callKimi(apiKey, messages);
    } catch (err) {
      this.logger.error(`Kimi call failed: ${(err as Error).message}`);
      return { reply: 'EVA no pudo conectarse al modelo de IA en este momento. Intenta de nuevo en un momento.' };
    }

    const choice = completion?.choices?.[0]?.message;
    if (!choice) {
      return { reply: 'EVA no obtuvo una respuesta válida del modelo.' };
    }

    const toolCall = choice.tool_calls?.[0];
    if (toolCall?.function?.name === 'crear_cotizacion') {
      return this.executeCrearCotizacion(toolCall);
    }

    return { reply: choice.content || 'EVA no generó una respuesta.' };
  }

  private async executeCrearCotizacion(toolCall: KimiToolCall): Promise<EvaChatResult> {
    let args: { clienteEmail?: string; descripcionPedido?: string };
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch {
      return { reply: 'EVA intentó generar una cotización pero los datos no llegaron completos. ¿Puedes repetir la solicitud con el correo del cliente y qué producto/cantidad necesita?' };
    }
    if (!args.clienteEmail || !args.descripcionPedido) {
      return { reply: 'Para generar la cotización necesito el correo del cliente y qué producto/cantidad pide.' };
    }

    const result = await this.quotesService.processIncomingEmail({
      from: args.clienteEmail,
      subject: 'Solicitud vía EVA',
      body: args.descripcionPedido,
    });

    if (result.outcome === 'quoted' && result.quote) {
      return {
        reply: `Listo — generé la cotización ${result.quote.quoteNumber} por $${Number(result.quote.total).toLocaleString('es-CO')} COP para ${args.clienteEmail}. El PDF ya se envió al cliente por correo.`,
        action: { type: 'quote_created', data: { quoteNumber: result.quote.quoteNumber, total: result.quote.total } },
      };
    }
    if (result.outcome === 'rejected_unknown_client') {
      return { reply: `No pude generar la cotización: "${args.clienteEmail}" no pertenece a ningún cliente registrado y activo en Oben Xmart.` };
    }
    if (result.outcome === 'insufficient_info') {
      return { reply: `Identifiqué al cliente, pero no logré reconocer ningún producto del catálogo real en "${args.descripcionPedido}". ¿Puedes ser más específico con el SKU o nombre del producto?` };
    }
    return { reply: result.message || 'EVA procesó la solicitud pero el resultado no fue claro.' };
  }

  private async callKimi(
    apiKey: string,
    messages: KimiMessage[],
  ): Promise<{ choices?: Array<{ message: { content: string; tool_calls?: KimiToolCall[] } }> }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const res = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: KIMI_MODEL,
          messages,
          tools: TOOLS,
          tool_choice: 'auto',
          temperature: 0.3,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Kimi API ${res.status}: ${text.slice(0, 200)}`);
      }
      return await res.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}
