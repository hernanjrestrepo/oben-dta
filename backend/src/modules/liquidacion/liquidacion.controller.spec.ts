import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../security/permissions.guard';
import { REQUIRE_PERMISSION_KEY } from '../security/require-permission.decorator';
import { LIQUIDACION_APROBAR_PERMISSION, LIQUIDACION_CONSULTA_PERMISSION, LIQUIDACION_PERMISSION, LiquidacionController } from './liquidacion.controller';

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

  it('liquidar exige exportations.liquidate y consultar exportations.read (ambos existen en el catálogo)', () => {
    expect(LIQUIDACION_PERMISSION).toBe('exportations.liquidate');
    expect(LIQUIDACION_CONSULTA_PERMISSION).toBe('exportations.read');
  });

  it('tiene exactamente las 16 rutas esperadas (incoterms, draft GET/POST, aprobar, ruta de COMEX y sus adjuntos, submit, correo de cierre, proforma y descartar/restaurar pendientes)', () => {
    expect(routes.sort()).toEqual(['adjuntarRuta', 'adjuntoRuta', 'approve', 'cierreEnviar', 'cierrePreview', 'descartar', 'draft', 'draftWithInput', 'incoterms', 'proforma', 'proformaDocumento', 'proformaExcel', 'proformaPdfDoc', 'restaurar', 'ruta', 'submit']);
  });

  it('aprobar exige exportations.approve (COMEX), distinto de liquidar', () => {
    expect(LIQUIDACION_APROBAR_PERMISSION).toBe('exportations.approve');
    const req = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, proto['approve'] as object) as { permissions: string[]; mode: string };
    expect(req).toEqual({ permissions: ['exportations.approve'], mode: 'all' });
  });

  // Perfil "Solo lectura" (22-oct): ve el borrador (también recalculado con lo que digita, sin escribir nada), la proforma y la vista previa del cierre.
  it.each(['incoterms', 'draft', 'draftWithInput', 'adjuntoRuta', 'proforma', 'proformaDocumento', 'proformaExcel', 'proformaPdfDoc', 'cierrePreview'])('la consulta %s exige exportations.read', (name) => {
    const req = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, proto[name] as object) as { permissions: string[]; mode: string };
    expect(req).toEqual({ permissions: ['exportations.read'], mode: 'all' });
  });

  it.each(['ruta', 'adjuntarRuta', 'submit', 'cierreEnviar', 'descartar', 'restaurar'])('la ruta %s (cambia algo) exige exportations.liquidate', (name) => {
    const req = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, proto[name] as object) as {
      permissions: string[];
      mode: string;
    };
    expect(req).toEqual({ permissions: ['exportations.liquidate'], mode: 'all' });
  });
});
