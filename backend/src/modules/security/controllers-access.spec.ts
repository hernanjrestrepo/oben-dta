import 'reflect-metadata';
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { CONTROLLER_WATERMARK, GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { REQUIRE_PERMISSION_KEY, type PermissionRequirement } from './require-permission.decorator';

/**
 * Política transversal (ver nota en PermissionsGuard): TODA ruta de negocio
 * exige JwtAuthGuard + PermissionsGuard + @RequirePermission. Estar
 * autenticado NO basta a secas — por eso `POST /auth/register` (que antes
 * era público) ahora exige `users.create`: de lo contrario cualquiera que
 * conociera el slug del tenant podía crearse una cuenta.
 *
 * Este test recorre todos los `*.controller.ts` de `src/` y falla si aparece
 * una ruta nueva sin permiso. Las únicas excepciones son las de abajo, cada
 * una con su razón — agregar una exige justificarla aquí.
 */
const ROUTES_WITHOUT_PERMISSION: Record<string, string> = {
  'AppController.getHello': 'público: saludo de la raíz, sin datos',
  'HealthController.check': 'público: health check del contenedor',
  'AuthController.login': 'público: inicio de sesión',
  'AuthController.platformLogin': 'público: inicio de sesión de plataforma',
  'AuthController.refresh': 'público: renovación de token (valida el refresh token)',
  'AuthController.logout': 'solo JWT: cierra la sesión propia',
  'SecurityController.myPermissions': 'solo JWT: lista los permisos del propio usuario',
  'LicenseController.status': 'solo JWT: estado de licencia del propio tenant (pantalla de bloqueo)',
};

function controllerFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...controllerFiles(full));
    else if (name.endsWith('.controller.ts')) out.push(full);
  }
  return out;
}

interface RouteInfo {
  id: string;
  file: string;
  guards: unknown[];
  requirement?: PermissionRequirement;
}

function collectRoutes(): RouteInfo[] {
  const srcRoot = join(__dirname, '..', '..');
  const routes: RouteInfo[] = [];
  for (const file of controllerFiles(srcRoot)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file) as Record<string, unknown>;
    for (const exported of Object.values(mod)) {
      if (typeof exported !== 'function' || !Reflect.getMetadata(CONTROLLER_WATERMARK, exported)) continue;
      const ctrl = exported as { name: string; prototype: Record<string, unknown> };
      const classGuards = (Reflect.getMetadata(GUARDS_METADATA, ctrl) as unknown[] | undefined) ?? [];
      const classReq = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, ctrl) as PermissionRequirement | undefined;
      for (const name of Object.getOwnPropertyNames(ctrl.prototype)) {
        const handler = ctrl.prototype[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue; // no es una ruta
        const methodGuards = (Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[] | undefined) ?? [];
        routes.push({
          id: `${ctrl.name}.${name}`,
          file: relative(srcRoot, file),
          guards: [...classGuards, ...methodGuards],
          requirement:
            (Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler) as PermissionRequirement | undefined) ?? classReq,
        });
      }
    }
  }
  return routes;
}

describe('Control de acceso — todas las rutas de todos los controllers', () => {
  const routes = collectRoutes();

  it('encuentra los controllers (sanidad del recorrido)', () => {
    expect(routes.length).toBeGreaterThan(100);
    expect(routes.map((r) => r.id)).toEqual(
      expect.arrayContaining(['FacturacionController.send', 'LiquidacionController.submit', 'PackingListController.sendByEmail']),
    );
  });

  it('ninguna ruta de negocio queda accesible solo con estar autenticado', () => {
    const offenders = routes
      .filter((r) => !(r.id in ROUTES_WITHOUT_PERMISSION))
      .filter(
        (r) =>
          !r.guards.includes(JwtAuthGuard) || !r.guards.includes(PermissionsGuard) || !r.requirement?.permissions?.length,
      )
      .map((r) => `${r.id} (${r.file})`);
    expect(offenders).toEqual([]);
  });

  it('la lista de excepciones no tiene entradas obsoletas', () => {
    const ids = new Set(routes.map((r) => r.id));
    expect(Object.keys(ROUTES_WITHOUT_PERMISSION).filter((id) => !ids.has(id))).toEqual([]);
  });

  it.each([
    ['PackingListController.sendByEmail', 'orders.update'],
    ['ObenReportsController.sendPackage', 'orders.update'],
    ['ObenReportsController.sendReport', 'orders.update'],
    ['DistributionListsController.create', 'configuracion.update'],
    ['DistributionListsController.associate', 'configuracion.update'],
    ['EquivalencesController.update', 'products.update'],
    ['EvaController.chat', 'quotes.create'],
    ['IntegrationHubController.execute', 'integrations.update'],
    ['AuthController.register', 'users.create'],
  ])('%s (efecto real: correo/escritura) exige %s, no un permiso de solo lectura', (id, permission) => {
    const route = routes.find((r) => r.id === id);
    expect(route?.requirement?.permissions).toEqual([permission]);
  });
});
