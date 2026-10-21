import { SharepointDiagnosticoService } from './sharepoint-diagnostico.service';

const tokenCon = (claims: Record<string, unknown>) => `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`;
const resp = (status: number, body: unknown) => ({ status, ok: status < 300, json: async () => body }) as unknown as Response;

function armar(rutas: (url: string) => Response) {
  const tenants = { findOne: jest.fn(async () => ({ integrationConfig: { email: { mode: 'real', imap: { user: 'oben.xmart@obengroup.com' } } }, settings: {} })) };
  const audit = { log: jest.fn() };
  const svc = new SharepointDiagnosticoService(tenants as never, { tenantId: 't1', userId: 'u1' } as never, audit as never);
  const llamadas: string[] = [];
  svc.fetchFn = jest.fn(async (url: string | URL | Request) => {
    llamadas.push(String(url));
    return rutas(String(url));
  }) as never;
  return { svc, audit, llamadas };
}

describe('SharepointDiagnosticoService', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.MS_MAIL_OAUTH_CLIENT_ID = '7b76a249-a8d6-44a8-bc64-ee91b01e2e09';
    process.env.MS_MAIL_OAUTH_CLIENT_SECRET = 'secreto-que-nunca-sale';
    process.env.MS_MAIL_OAUTH_TENANT_ID = 'b8ea9857-a73b-4e03-9daa-0d39c6bcc284';
  });
  afterAll(() => {
    process.env = env;
  });

  it('lo visto el 21-oct: token solo con Mail.* y 403 en SharePoint → "sin_permiso" con qué hacer; nunca expone el secreto ni el token', async () => {
    const token = tokenCon({ app_displayname: 'og-smtp-oauth', roles: ['Mail.ReadWrite', 'Mail.Read', 'Mail.Send'], iat: 1792600000 });
    const { svc, audit } = armar((u) =>
      u.includes('/oauth2/') ? resp(200, { access_token: token }) : resp(403, { error: { code: 'accessDenied', message: 'Access denied' } }),
    );
    const d = await svc.probar();
    expect(d.resultado).toBe('sin_permiso');
    expect(d.app).toMatchObject({ clientId: '7b76a249-a8d6-44a8-bc64-ee91b01e2e09', nombre: 'og-smtp-oauth' });
    expect(d.buzonCorreo).toBe('oben.xmart@obengroup.com');
    expect(d.token?.permisos).toEqual(['Mail.ReadWrite', 'Mail.Read', 'Mail.Send']);
    expect(d.token?.permisosSharepoint).toEqual([]);
    expect(d.pasos.map((p) => p.status)).toEqual([200, 403, 403]);
    expect(d.explicacion.queHacer).toMatch(/Sites\.Selected/);
    const json = JSON.stringify(d);
    expect(json).not.toContain('secreto-que-nunca-sale');
    expect(json).not.toContain(token);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'sharepoint_diagnostico' }));
  });

  it('con Sites.Selected pero sin acceso al sitio: dice que falta el permiso sobre ESE sitio', async () => {
    const token = tokenCon({ roles: ['Mail.Read', 'Sites.Selected'] });
    const { svc } = armar((u) => (u.includes('/oauth2/') ? resp(200, { access_token: token }) : resp(403, { error: { code: 'accessDenied' } })));
    const d = await svc.probar();
    expect(d.resultado).toBe('sin_permiso');
    expect(d.explicacion.queHacer).toMatch(/New-MgSitePermission/);
  });

  it('con permiso: encuentra el Excel por el sitio y lee hojas y tamaños', async () => {
    const token = tokenCon({ roles: ['Sites.Selected'] });
    const { svc } = armar((u) => {
      if (u.includes('/oauth2/')) return resp(200, { access_token: token });
      if (u.includes('/shares/')) return resp(403, { error: { code: 'accessDenied' } });
      if (u.endsWith('/sites/obengroup.sharepoint.com:/sites/CO-OBC-Comercial-Pelicula')) return resp(200, { id: 'S1', displayName: 'CO-OBC-Comercial-Pelicula' });
      if (u.endsWith('/sites/S1/drives')) return resp(200, { value: [{ id: 'D1', name: 'Documentos' }] });
      if (u.includes('/root/search')) return resp(200, { value: [{ id: 'I1', name: 'SEGUIMIENTO DIARIO OBEN COLOMBIA.xlsx', parentReference: { driveId: 'D1' } }] });
      if (u.endsWith('/workbook/worksheets')) return resp(200, { value: [{ name: 'Seguimiento' }] });
      if (u.includes('usedRange')) return resp(200, { address: 'Seguimiento!A1:Z400', rowCount: 400, columnCount: 26 });
      return resp(404, {});
    });
    const d = await svc.probar();
    expect(d.resultado).toBe('ok');
    expect(d.hojas).toEqual([{ nombre: 'Seguimiento', rango: 'Seguimiento!A1:Z400', filas: 400, columnas: 26 }]);
  });

  it('secreto inválido: Microsoft no da token → "sin_token"', async () => {
    const { svc } = armar(() => resp(401, { error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret provided.' }));
    const d = await svc.probar();
    expect(d.resultado).toBe('sin_token');
    expect(d.pasos[0].detalle).toMatch(/AADSTS7000215/);
  });
});
