import { Injectable } from '@nestjs/common';
import { readSharepointAppCredentialsFromEnv } from '../../common/microsoft-oauth/microsoft-app-token.service';
import { ARCHIVO_CUADRO_POR_DEFECTO } from './sharepoint-diagnostico.service';

type Fetch = typeof fetch;

/**
 * Lectura (solo lectura) de hojas de un Excel en SharePoint con la app de archivos (MS_SHAREPOINT_*, permiso
 * Sites.Selected). Nunca escribe en el archivo.
 */
@Injectable()
export class SharepointExcelService {
  /** Las pruebas inyectan un fetch falso. */
  fetchFn: Fetch = (input, init) => fetch(input, init);
  private token: { valor: string; hasta: number } | null = null;

  private async graph(ruta: string, extra: Record<string, string> = {}): Promise<Record<string, unknown>> {
    const r = await this.fetchFn(`https://graph.microsoft.com/v1.0${ruta}`, { headers: { Authorization: `Bearer ${await this.accessToken()}`, ...extra } });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown> & { error?: { code?: string; message?: string } };
    if (r.status >= 300) throw new Error(`SharePoint respondió ${r.status} ${j.error?.code ?? ''}: ${String(j.error?.message ?? '').slice(0, 200)}`);
    return j;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.hasta > Date.now()) return this.token.valor;
    const c = readSharepointAppCredentialsFromEnv();
    if (!c) throw new Error('Falta la app de SharePoint en el servidor (MS_SHAREPOINT_*).');
    const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: c.clientId, client_secret: c.clientSecret, scope: 'https://graph.microsoft.com/.default' });
    const r = await this.fetchFn(`https://login.microsoftonline.com/${c.azureTenantId}/oauth2/v2.0/token`, { method: 'POST', body });
    const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!j.access_token) throw new Error(`Microsoft no entregó token a la app de SharePoint: ${String(j.error_description ?? r.status).split('\r\n')[0].slice(0, 200)}`);
    this.token = { valor: j.access_token, hasta: Date.now() + ((j.expires_in ?? 3600) - 120) * 1000 };
    return j.access_token;
  }

  /** Valores de un rango de una hoja (fechas llegan como número de serie de Excel). */
  async leerRango(hoja: string, rango: string, url: string = ARCHIVO_CUADRO_POR_DEFECTO.url): Promise<unknown[][]> {
    const share = 'u!' + Buffer.from(url).toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
    const item = (await this.graph(`/shares/${share}/driveItem`, { Prefer: 'redeemSharingLinkIfNecessary' })) as { id: string; parentReference: { driveId: string } };
    const r = await this.graph(`/drives/${item.parentReference.driveId}/items/${item.id}/workbook/worksheets('${encodeURIComponent(hoja)}')/range(address='${rango}')?$select=values`);
    return (r.values as unknown[][]) ?? [];
  }
}
