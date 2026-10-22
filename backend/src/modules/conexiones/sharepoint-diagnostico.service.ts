import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContext } from '../../common/tenant/tenant-context.service';
import { readMicrosoftAppCredentialsFromEnv, readSharepointAppCredentialsFromEnv } from '../../common/microsoft-oauth/microsoft-app-token.service';
import { Tenant } from '../../entities/tenant.entity';
import { WorkflowEventType } from '../../entities/workflow-event.entity';
import { WorkflowAuditService } from '../security/workflow-audit.service';

/** El cuadro diario de facturación de Oben (Alejandra/Camilo), compartido en SharePoint. */
export const ARCHIVO_CUADRO_POR_DEFECTO = {
  nombre: 'SEGUIMIENTO DIARIO OBEN COLOMBIA.xlsx',
  host: 'obengroup.sharepoint.com',
  sitio: '/sites/CO-OBC-Comercial-Pelicula',
  url: 'https://obengroup.sharepoint.com/:x:/r/sites/CO-OBC-Comercial-Pelicula/_layouts/15/Doc.aspx?sourcedoc=%7B8A51E10B-8037-4B5B-BE7A-4F8A6B702265%7D&file=SEGUIMIENTO%20DIARIO%20OBEN%20COLOMBIA.xlsx&action=default&mobileredirect=true',
};

/** Permisos de aplicación con los que Graph deja leer SharePoint (cualquiera de estos). */
const PERMISOS_SHAREPOINT = ['Sites.Selected', 'Sites.Read.All', 'Sites.ReadWrite.All', 'Sites.Manage.All', 'Sites.FullControl.All', 'Files.Read.All', 'Files.ReadWrite.All'];

export interface PasoDiagnostico {
  paso: string;
  /** Qué se le pidió a Microsoft (ruta de Graph, sin tokens). */
  solicitud: string;
  status: number | null;
  ok: boolean;
  detalle: string;
}

export interface DiagnosticoSharepoint {
  probadoEn: string;
  resultado: 'ok' | 'sin_credenciales' | 'sin_token' | 'sin_permiso' | 'no_encontrado' | 'error';
  /** Qué pasó / qué significa / qué hacer (en palabras de negocio). */
  explicacion: { quePaso: string; queSignifica: string; queHacer: string };
  /** App SOLO para leer el archivo en SharePoint (permiso Sites.Selected). */
  app: {
    clientId: string | null;
    azureTenantId: string | null;
    nombre: string | null;
    /** Nunca se muestra: solo dónde está. */
    secreto: string;
    autenticacion: string;
  };
  /** App del correo (Mail.*): otra aplicación, con otros permisos. */
  appCorreo: { clientId: string | null; nombre: string };
  buzonCorreo: string | null;
  archivo: { nombre: string; sitio: string; url: string };
  token: { obtenido: boolean; emitido: string | null; permisos: string[]; permisosSharepoint: string[] } | null;
  pasos: PasoDiagnostico[];
  hojas: Array<{ nombre: string; rango: string | null; filas: number | null; columnas: number | null }>;
}

type Fetch = typeof fetch;

/**
 * Prueba, desde Oben Xmart y en SOLO LECTURA, si la aplicación de Microsoft 365 con la que entra el sistema
 * (la misma del correo) puede abrir el Excel del cuadro diario en SharePoint. Pide un token NUEVO (sin caché)
 * para mostrar los permisos que Microsoft le da HOY a la app y recorre los mismos caminos que usaría el
 * sistema. Nunca devuelve el token ni el secreto; del Excel solo nombres de hojas y tamaños.
 */
@Injectable()
export class SharepointDiagnosticoService {
  private readonly logger = new Logger(SharepointDiagnosticoService.name);
  /** Las pruebas inyectan un fetch falso. */
  fetchFn: Fetch = (input, init) => fetch(input, init);

  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly ctx: TenantContext,
    private readonly audit: WorkflowAuditService,
  ) {}

  /** Lo que se puede mostrar sin llamar a Microsoft: qué app, qué buzón, qué archivo. */
  async configuracion(): Promise<Pick<DiagnosticoSharepoint, 'app' | 'appCorreo' | 'buzonCorreo' | 'archivo'>> {
    const c = readSharepointAppCredentialsFromEnv();
    const correo = readMicrosoftAppCredentialsFromEnv();
    const t = await this.tenants.findOne({ where: { id: this.ctx.tenantId } });
    const email = (t?.integrationConfig as Record<string, unknown> | undefined)?.email as Record<string, unknown> | undefined;
    const imap = email?.imap as Record<string, unknown> | undefined;
    const cuadro = ((t?.settings as Record<string, unknown> | undefined)?.facturacion as Record<string, unknown> | undefined)?.cuadroSharepointUrl;
    const url = typeof cuadro === 'string' && cuadro.startsWith('https://') ? cuadro : ARCHIVO_CUADRO_POR_DEFECTO.url;
    return {
      app: {
        clientId: c?.clientId ?? null,
        azureTenantId: c?.azureTenantId ?? null,
        nombre: null,
        secreto: c ? 'Configurado en el servidor de Oben Xmart (archivo .env, variable MS_SHAREPOINT_CLIENT_SECRET). No se muestra.' : 'NO configurado en el servidor (MS_SHAREPOINT_*).',
        autenticacion:
          'La app entra como APLICACIÓN (OAuth2 client_credentials con Client ID + secreto), sin usuario ni contraseña. Por eso compartir el archivo con una persona no le da acceso: el permiso se le da a la app en Microsoft Entra ID.',
      },
      appCorreo: { clientId: correo?.clientId ?? null, nombre: 'App del correo (Mail.Read / Mail.Send): otra aplicación, no se usa para SharePoint' },
      buzonCorreo: typeof imap?.user === 'string' ? imap.user : null,
      archivo: { nombre: ARCHIVO_CUADRO_POR_DEFECTO.nombre, sitio: `${ARCHIVO_CUADRO_POR_DEFECTO.host}${ARCHIVO_CUADRO_POR_DEFECTO.sitio}`, url },
    };
  }

  async probar(): Promise<DiagnosticoSharepoint> {
    const base = await this.configuracion();
    const d: DiagnosticoSharepoint = {
      probadoEn: new Date().toISOString(),
      resultado: 'error',
      explicacion: { quePaso: '', queSignifica: '', queHacer: '' },
      ...base,
      token: null,
      pasos: [],
      hojas: [],
    };
    try {
      await this.ejecutar(d);
    } catch (err) {
      d.resultado = 'error';
      d.explicacion = {
        quePaso: `La prueba se interrumpió: ${(err as Error).message}`,
        queSignifica: 'No se pudo completar la comunicación con Microsoft (red o servicio caído).',
        queHacer: 'Repetir la prueba en unos minutos; si sigue, revisar la salida a internet del servidor.',
      };
    }
    await this.audit.log({
      workflowName: 'conexiones',
      eventType: WorkflowEventType.ACTION_EXECUTED,
      action: 'sharepoint_diagnostico',
      entityType: 'conexion',
      entityId: 'sharepoint-cuadro',
      actorId: this.ctx.userId,
      outputData: { resultado: d.resultado, permisos: d.token?.permisos ?? [], pasos: d.pasos.map((p) => ({ paso: p.paso, status: p.status })) },
      reason: d.explicacion.quePaso,
    });
    return d;
  }

  private async ejecutar(d: DiagnosticoSharepoint): Promise<void> {
    const c = readSharepointAppCredentialsFromEnv();
    if (!c) {
      d.resultado = 'sin_credenciales';
      d.explicacion = {
        quePaso: 'El servidor de Oben Xmart no tiene configurada la app de SharePoint (faltan MS_SHAREPOINT_*).',
        queSignifica: 'La app del correo es otra y no tiene permiso sobre SharePoint: hace falta la app de archivos.',
        queHacer: 'Configurar Client ID, Tenant ID y secreto de la app de SharePoint en el .env del servidor.',
      };
      return;
    }
    // 1) Token nuevo para Microsoft Graph (no el que está en caché para el correo).
    const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: c.clientId, client_secret: c.clientSecret, scope: 'https://graph.microsoft.com/.default' });
    const tr = await this.fetchFn(`https://login.microsoftonline.com/${c.azureTenantId}/oauth2/v2.0/token`, { method: 'POST', body });
    const tj = (await tr.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
    d.pasos.push({
      paso: 'Pedir permiso (token) a Microsoft para la app',
      solicitud: `POST login.microsoftonline.com/${c.azureTenantId}/oauth2/v2.0/token (scope Microsoft Graph)`,
      status: tr.status,
      ok: !!tj.access_token,
      detalle: tj.access_token ? 'Microsoft entregó el token.' : `${tj.error ?? ''} ${String(tj.error_description ?? '').split('\r\n')[0].slice(0, 240)}`.trim(),
    });
    if (!tj.access_token) {
      d.resultado = 'sin_token';
      d.explicacion = {
        quePaso: 'Microsoft no le entregó token a la app.',
        queSignifica: 'El Client ID, el Tenant ID o el secreto no son válidos (o el secreto venció).',
        queHacer: 'TI de Oben: revisar la app en Entra ID (secreto vigente) y actualizarlo en el servidor.',
      };
      return;
    }
    const claims = leerClaims(tj.access_token);
    const permisos = Array.isArray(claims.roles) ? (claims.roles as string[]) : [];
    d.app.nombre = typeof claims.app_displayname === 'string' ? claims.app_displayname : null;
    d.token = {
      obtenido: true,
      emitido: typeof claims.iat === 'number' ? new Date(claims.iat * 1000).toISOString() : null,
      permisos,
      permisosSharepoint: permisos.filter((p) => PERMISOS_SHAREPOINT.includes(p)),
    };

    const H = { Authorization: `Bearer ${tj.access_token}` };
    const get = async (paso: string, ruta: string, extra: Record<string, string> = {}, ok: (j: Record<string, unknown>) => string) => {
      const r = await this.fetchFn(`https://graph.microsoft.com/v1.0${ruta}`, { headers: { ...H, ...extra } });
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown> & { error?: { code?: string; message?: string } };
      const p: PasoDiagnostico = {
        paso,
        solicitud: `GET graph.microsoft.com/v1.0${ruta.length > 110 ? `${ruta.slice(0, 110)}…` : ruta}`,
        status: r.status,
        ok: r.status < 300,
        detalle: r.status < 300 ? ok(j) : `${j.error?.code ?? ''} — ${String(j.error?.message ?? '').slice(0, 240)}`,
      };
      d.pasos.push(p);
      return { r, j, p };
    };

    // 2) El archivo por su enlace de compartir; 3) el sitio por su ruta; 4) la biblioteca del sitio.
    const share = 'u!' + Buffer.from(d.archivo.url).toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
    const a = await get('Abrir el archivo por su enlace', `/shares/${share}/driveItem`, { Prefer: 'redeemSharingLinkIfNecessary' }, (j) => String(j.name ?? ''));
    let item = a.p.ok ? a.j : null;
    const s = await get('Abrir el sitio de SharePoint', `/sites/${ARCHIVO_CUADRO_POR_DEFECTO.host}:${ARCHIVO_CUADRO_POR_DEFECTO.sitio}`, {}, (j) => String(j.displayName ?? ''));
    if (!item && s.p.ok) {
      const drives = await get('Listar las bibliotecas del sitio', `/sites/${String(s.j.id)}/drives`, {}, (j) => ((j.value as Array<{ name: string }>) ?? []).map((x) => x.name).join(' | '));
      for (const dr of (drives.j.value as Array<{ id: string; name: string }> | undefined) ?? []) {
        const b = await get(`Buscar el archivo en "${dr.name}"`, `/drives/${dr.id}/root/search(q='SEGUIMIENTO DIARIO')`, {}, (j) =>
          ((j.value as Array<{ name: string }>) ?? []).map((x) => x.name).slice(0, 5).join(' | ') || '(nada)',
        );
        item = ((b.j.value as Array<Record<string, unknown>>) ?? []).find((v) => /SEGUIMIENTO DIARIO OBEN COLOMBIA\.xlsx/i.test(String(v.name))) ?? null;
        if (item) break;
      }
    }

    if (item) {
      const drive = (item.parentReference as { driveId?: string } | undefined)?.driveId;
      const hojas = await get('Leer las hojas del Excel', `/drives/${drive}/items/${String(item.id)}/workbook/worksheets`, {}, (j) =>
        ((j.value as Array<{ name: string }>) ?? []).map((h) => h.name).join(' | '),
      );
      for (const h of ((hojas.j.value as Array<{ name: string }>) ?? []).slice(0, 8)) {
        const u = await this.fetchFn(
          `https://graph.microsoft.com/v1.0/drives/${drive}/items/${String(item.id)}/workbook/worksheets('${encodeURIComponent(h.name)}')/usedRange(valuesOnly=true)?$select=address,rowCount,columnCount`,
          { headers: H },
        );
        const uj = (await u.json().catch(() => ({}))) as { address?: string; rowCount?: number; columnCount?: number };
        d.hojas.push({ nombre: h.name, rango: uj.address ?? null, filas: uj.rowCount ?? null, columnas: uj.columnCount ?? null });
      }
      d.resultado = 'ok';
      d.explicacion = {
        quePaso: `Oben Xmart abrió "${String(item.name)}" (${d.hojas.length} hoja(s)).`,
        queSignifica: 'La app ya tiene permiso: el cuadro del día se puede leer directo del Excel.',
        queHacer: 'Conectar la carga automática del cuadro diario.',
      };
      return;
    }

    const denegado = d.pasos.slice(1).some((p) => p.status === 401 || p.status === 403);
    if (denegado) {
      d.resultado = 'sin_permiso';
      const tieneSitios = d.token.permisosSharepoint.length > 0;
      d.explicacion = tieneSitios
        ? {
            quePaso: `La app tiene ${d.token.permisosSharepoint.join(', ')} pero SharePoint le niega el acceso al sitio.`,
            queSignifica: 'Con Sites.Selected, además del permiso hay que darle a la app acceso a ESE sitio (no basta compartir el archivo).',
            queHacer: 'TI de Oben: New-MgSitePermission sobre CO-OBC-Comercial-Pelicula con rol "read" para esta app.',
          }
        : {
            quePaso: `Microsoft le entregó a la app solo estos permisos: ${permisos.join(', ') || '(ninguno)'}. Ninguno es de SharePoint, y SharePoint respondió "acceso denegado".`,
            queSignifica: 'El permiso para leer el Excel no está dado a ESTA app (puede estar dado a otra app, como permiso "delegado" de usuario, o sin consentimiento de administrador).',
            queHacer: `TI de Oben: en Entra ID → App registrations → ${d.app.nombre ?? 'la app'} (${c.clientId}) → API permissions: agregar Microsoft Graph → Application → Sites.Selected y dar "Grant admin consent"; después darle lectura sobre el sitio CO-OBC-Comercial-Pelicula.`,
          };
      return;
    }
    d.resultado = 'no_encontrado';
    d.explicacion = {
      quePaso: 'Microsoft dejó entrar, pero no apareció el archivo.',
      queSignifica: 'El archivo se movió, se renombró o el enlace cambió.',
      queHacer: 'Pedir a Oben el enlace vigente del cuadro (y guardarlo en settings.facturacion.cuadroSharepointUrl).',
    };
  }
}

/** Claims del token (solo para mostrar app y permisos; el token nunca sale de aquí). */
function leerClaims(token: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as Record<string, unknown>;
  } catch {
    return {};
  }
}
