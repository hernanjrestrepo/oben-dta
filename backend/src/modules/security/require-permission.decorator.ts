import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSION_KEY = 'security:required_permissions';
export const REQUIRE_PERMISSION_ANY = 'security:any';
export const REQUIRE_PERMISSION_ALL = 'security:all';

export type PermissionRequirementMode = 'any' | 'all';

export interface PermissionRequirement {
  permissions: string[];
  mode: PermissionRequirementMode;
}

/**
 * Anota un endpoint con los permisos requeridos. Por defecto exige TODOS
 * (mode: 'all'). Usar `RequireAnyPermission` para OR.
 *
 * Los strings NO deben coincidir con un enum cerrado — el sistema resuelve
 * la existencia y validez del permiso contra BD en runtime. Esto permite
 * agregar permisos nuevos sin modificar el catálogo del código.
 */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, { permissions, mode: 'all' as const });

export const RequireAnyPermission = (...permissions: string[]) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, { permissions, mode: 'any' as const });
