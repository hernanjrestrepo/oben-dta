import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { REQUIRE_PERMISSION_KEY } from '../security/require-permission.decorator';
import { ComercialController } from './comercial.controller';

describe('ComercialController — control de acceso', () => {
  const proto = ComercialController.prototype as unknown as Record<string, unknown>;
  const routes = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor' && typeof proto[n] === 'function');

  it('usa JwtAuthGuard y PermissionsGuard a nivel de clase', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ComercialController)).toEqual(
      expect.arrayContaining([JwtAuthGuard, PermissionsGuard]),
    );
  });

  it('tiene exactamente las 3 rutas de solo lectura esperadas', () => {
    expect(routes.sort()).toEqual(['dashboard', 'list', 'proforma']);
  });

  it.each(['dashboard', 'list', 'proforma'])('la ruta %s exige orders.read', (name) => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, proto[name] as object)).toEqual({
      permissions: ['orders.read'],
      mode: 'all',
    });
  });
});
