import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormatoEnvio } from '../../entities/formato-envio.entity';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { WorkflowAuditService } from '../security/workflow-audit.service';
import { WorkflowEventType } from '../../entities/workflow-event.entity';
import {
  ENVIOS_CATALOGO,
  envioDeCatalogo,
  VARIABLES_FORMATO,
  type EnvioCatalogo,
  type VariableFormato,
} from '../distribution-lists/envios-catalogo';

export type VariablesEnvio = Partial<Record<VariableFormato, string | number>>;

export interface FormatoVista {
  clave: string;
  label: string;
  grupo: string;
  asunto: string;
  cuerpo: string;
  porDefecto: { asunto: string; cuerpo: string };
  personalizado: boolean;
  variables: Array<{ nombre: VariableFormato; descripcion: string }>;
  actualizado: string | null;
}

export interface CorreoRenderizado {
  asunto: string;
  /** HTML seguro: el texto del formato y las variables se escapan. */
  cuerpoHtml: string;
}

const MAX_ASUNTO = 300;
const MAX_CUERPO = 5000;

/**
 * Formatos de correo editables por documento/reporte (WO-027). Un envío pide
 * `render(clave, variables)`: si Oben guardó un formato para esa clave se usa;
 * si no, el texto por defecto del sistema (el mismo que salía antes de este
 * módulo, así que nada cambia hasta que alguien edite).
 *
 * Candado: si los datos vienen del simulador y el formato quitó {origen}, la
 * aclaración se agrega igual — un correo simulado nunca puede pasar por real.
 */
@Injectable()
export class FormatosService {
  constructor(
    @InjectRepository(FormatoEnvio) private readonly repo: Repository<FormatoEnvio>,
    private readonly ctx: TenantContext,
    private readonly audit: WorkflowAuditService,
  ) {}

  async listar(): Promise<FormatoVista[]> {
    const guardados = await this.repo.find({ where: { tenantId: this.ctx.tenantId } });
    return ENVIOS_CATALOGO.filter((e) => e.formato).map((e) => this.vista(e, guardados.find((g) => g.clave === e.clave)));
  }

  async guardar(clave: string, asunto: string, cuerpo: string): Promise<FormatoVista> {
    const e = this.formateable(clave);
    const a = (asunto ?? '').trim();
    const c = (cuerpo ?? '').trim();
    if (!a || !c) throw new BadRequestException('El asunto y el cuerpo son obligatorios.');
    if (a.length > MAX_ASUNTO) throw new BadRequestException(`El asunto admite hasta ${MAX_ASUNTO} caracteres.`);
    if (c.length > MAX_CUERPO) throw new BadRequestException(`El cuerpo admite hasta ${MAX_CUERPO} caracteres.`);
    const desconocidas = [...variablesUsadas(a), ...variablesUsadas(c)].filter((v) => !e.formato!.variables.includes(v as VariableFormato));
    if (desconocidas.length) {
      throw new BadRequestException(
        `Variables que no existen para "${e.label}": ${[...new Set(desconocidas)].map((v) => `{${v}}`).join(', ')}. Disponibles: ${e.formato!.variables.map((v) => `{${v}}`).join(', ')}.`,
      );
    }
    const tenantId = this.ctx.tenantId;
    const previo = await this.repo.findOne({ where: { tenantId, clave } });
    const fila = previo ?? this.repo.create({ tenantId, clave });
    fila.asunto = a;
    fila.cuerpo = c;
    fila.updatedBy = this.ctx.userId ?? null;
    const guardado = await this.repo.save(fila);
    await this.audit.log({
      workflowName: 'formatos-envio',
      eventType: WorkflowEventType.ACTION_EXECUTED,
      action: 'formato_envio_actualizado',
      entityType: 'formato_envio',
      entityId: clave,
      actorId: this.ctx.userId,
      inputData: { antes: previo ? { asunto: previo.asunto, cuerpo: previo.cuerpo } : null },
      outputData: { asunto: a, cuerpo: c },
    });
    return this.vista(e, guardado);
  }

  async restablecer(clave: string): Promise<FormatoVista> {
    const e = this.formateable(clave);
    const previo = await this.repo.findOne({ where: { tenantId: this.ctx.tenantId, clave } });
    if (previo) {
      await this.repo.delete({ id: previo.id, tenantId: this.ctx.tenantId });
      await this.audit.log({
        workflowName: 'formatos-envio',
        eventType: WorkflowEventType.ACTION_EXECUTED,
        action: 'formato_envio_restablecido',
        entityType: 'formato_envio',
        entityId: clave,
        actorId: this.ctx.userId,
        inputData: { antes: { asunto: previo.asunto, cuerpo: previo.cuerpo } },
        outputData: {},
      });
    }
    return this.vista(e, undefined);
  }

  /** Vista previa con valores de ejemplo, sin guardar. */
  vistaPrevia(clave: string, asunto: string, cuerpo: string): CorreoRenderizado {
    this.formateable(clave);
    return aplicar(asunto, cuerpo, EJEMPLO, false);
  }

  /** Asunto y cuerpo (HTML) listos para enviar. `simulado` agrega la aclaración si el formato la quitó. */
  async render(clave: string, vars: VariablesEnvio, simulado: boolean): Promise<CorreoRenderizado> {
    const e = envioDeCatalogo(clave);
    if (!e?.formato) throw new NotFoundException(`"${clave}" no tiene formato de correo.`);
    const guardado = await this.repo.findOne({ where: { tenantId: this.ctx.tenantId, clave } });
    const asunto = guardado?.asunto ?? e.formato.asunto;
    const cuerpo = guardado?.cuerpo ?? e.formato.cuerpo;
    return aplicar(asunto, cuerpo, { fecha: fechaCo(new Date()), ...vars }, simulado);
  }

  private formateable(clave: string): EnvioCatalogo & { formato: NonNullable<EnvioCatalogo['formato']> } {
    const e = envioDeCatalogo(clave);
    if (!e?.formato) throw new NotFoundException(`"${clave}" no tiene formato de correo editable.`);
    return e as EnvioCatalogo & { formato: NonNullable<EnvioCatalogo['formato']> };
  }

  private vista(e: EnvioCatalogo, g: FormatoEnvio | undefined): FormatoVista {
    const f = e.formato!;
    return {
      clave: e.clave,
      label: e.label,
      grupo: e.grupo,
      asunto: g?.asunto ?? f.asunto,
      cuerpo: g?.cuerpo ?? f.cuerpo,
      porDefecto: { asunto: f.asunto, cuerpo: f.cuerpo },
      personalizado: !!g,
      variables: f.variables.map((nombre) => ({ nombre, descripcion: VARIABLES_FORMATO[nombre] })),
      actualizado: g ? g.updatedAt.toISOString() : null,
    };
  }
}

/**
 * Lo que usan los módulos que envían: formato guardado si hay servicio y
 * responde; si no (pruebas, o la consulta falla), el texto por defecto. Un
 * formato nunca puede impedir que salga un correo operativo.
 */
export async function renderEnvio(
  formatos: FormatosService | null | undefined,
  clave: string,
  vars: VariablesEnvio,
  simulado: boolean,
): Promise<CorreoRenderizado> {
  if (formatos) {
    try {
      return await formatos.render(clave, vars, simulado);
    } catch {
      /* cae al texto por defecto */
    }
  }
  const f = envioDeCatalogo(clave)?.formato;
  if (!f) throw new NotFoundException(`"${clave}" no tiene formato de correo.`);
  return aplicar(f.asunto, f.cuerpo, { fecha: fechaCo(new Date()), ...vars }, simulado);
}

const EJEMPLO: VariablesEnvio = {
  ov: 11187,
  cliente: 'OBEN US, LLC',
  reporte: 'Lista de Empaque Unificada',
  origen: 'con datos consultados en vivo al sistema real de Oben',
  sufijo: '',
  fecha: '1 oct 2026, 9:39 a. m.',
};

function variablesUsadas(texto: string): string[] {
  return [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}

function sustituir(texto: string, vars: VariablesEnvio, escapar: boolean): string {
  return texto.replace(/\{(\w+)\}/g, (todo, nombre: string) => {
    const v = vars[nombre as VariableFormato];
    if (v === undefined || v === null) return '';
    return escapar ? escapeHtml(String(v)) : String(v);
  });
}

function aplicar(asunto: string, cuerpo: string, vars: VariablesEnvio, simulado: boolean): CorreoRenderizado {
  let html = sustituir(escapeHtml(cuerpo), vars, true);
  if (simulado && !cuerpo.includes('{origen}') && vars.origen) {
    html += `\n\n(${escapeHtml(String(vars.origen))})`;
  }
  const cuerpoHtml = html
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  // El asunto es texto plano: sin saltos de línea (evita inyección de cabeceras).
  return { asunto: sustituir(asunto, vars, false).replace(/[\r\n]+/g, ' ').trim(), cuerpoHtml };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fechaCo(d: Date): string {
  return d.toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' });
}
