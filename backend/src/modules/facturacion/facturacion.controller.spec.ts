import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { REQUIRE_PERMISSION_KEY } from '../security/require-permission.decorator';
import { FacturacionController } from './facturacion.controller';

/**
 * El borrador expone valores comerciales y `send` dispara un correo real a
 * COMEX/Distribución: ninguna ruta puede quedar accesible solo con estar
 * autenticado. Reutiliza los permisos ya existentes del catálogo de
 * "invoices" — no se agregó ningún permiso nuevo.
 */
describe('FacturacionController — control de acceso', () => {
  const proto = FacturacionController.prototype as unknown as Record<string, unknown>;
  const routes = Object.getOwnPropertyNames(proto).filter(
    (n) => n !== 'constructor' && n !== 'parseOrderNumber' && n !== 'sendPdf' && typeof proto[n] === 'function',
  );

  it('usa JwtAuthGuard y PermissionsGuard a nivel de clase', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, FacturacionController) as unknown[];
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, PermissionsGuard]));
  });

  it('tiene exactamente las 8 rutas esperadas', () => {
    expect(routes.sort()).toEqual([
      'destinatarios',
      'downloadPdf',
      'downloadPdfWithInput',
      'draft',
      'draftWithInput',
      'historial',
      'ordenesRecientes',
      'send',
    ]);
  });

  it.each(['draft', 'draftWithInput', 'downloadPdf', 'downloadPdfWithInput', 'historial', 'destinatarios', 'ordenesRecientes'])(
    'la ruta %s exige invoices.read',
    (name) => {
    const req = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, proto[name] as object) as {
      permissions: string[];
      mode: string;
    };
    expect(req).toEqual({ permissions: ['invoices.read'], mode: 'all' });
    },
  );

  it('la ruta send exige invoices.send (dispara un correo real)', () => {
    const req = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, proto.send as object) as {
      permissions: string[];
      mode: string;
    };
    expect(req).toEqual({ permissions: ['invoices.send'], mode: 'all' });
  });
});
