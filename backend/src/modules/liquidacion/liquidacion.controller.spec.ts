import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { REQUIRE_PERMISSION_KEY } from '../security/require-permission.decorator';
import { LIQUIDACION_PERMISSION, LiquidacionController } from './liquidacion.controller';

/**
 * Liquidación crea registros reales en el ERP de Oben (con confirm:true) y
 * expone valores financieros: NINGUNA ruta puede quedar accesible solo con
 * estar autenticado. Este test falla si alguien agrega una ruta sin permiso.
 */
describe('LiquidacionController — control de acceso', () => {
  const proto = LiquidacionController.prototype as unknown as Record<string, unknown>;
  const routes = Object.getOwnPropertyNames(proto).filter(
    (n) => n !== 'constructor' && typeof proto[n] === 'function',
  );

  it('usa JwtAuthGuard y PermissionsGuard a nivel de clase', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, LiquidacionController) as unknown[];
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, PermissionsGuard]));
  });

  it('el permiso requerido es exportations.liquidate (existe en el catálogo)', () => {
    expect(LIQUIDACION_PERMISSION).toBe('exportations.liquidate');
  });

  it('tiene exactamente las 3 rutas esperadas (draft GET, draft POST, submit POST)', () => {
    expect(routes.sort()).toEqual(['draft', 'draftWithInput', 'submit']);
  });

  it.each(['draft', 'draftWithInput', 'submit'])('la ruta %s exige exportations.liquidate', (name) => {
    const req = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, proto[name] as object) as {
      permissions: string[];
      mode: string;
    };
    expect(req).toEqual({ permissions: ['exportations.liquidate'], mode: 'all' });
  });
});
