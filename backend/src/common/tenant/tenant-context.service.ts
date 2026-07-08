import { Injectable, Scope } from '@nestjs/common';

/**
 * Contexto de tenant vivo durante una request. Se rellena desde el JWT (tenantId)
 * y es consumido por TenantRepository e interceptores para forzar el aislamiento.
 *
 * Es Scope.REQUEST para evitar cualquier cruce accidental entre peticiones.
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  private _tenantId: string | null = null;
  private _userId: string | null = null;
  private _isSuperAdmin = false;

  setContext(tenantId: string | null, userId: string | null, isSuperAdmin = false): void {
    this._tenantId = tenantId;
    this._userId = userId;
    this._isSuperAdmin = isSuperAdmin;
  }

  get tenantId(): string {
    if (!this._tenantId && !this._isSuperAdmin) {
      throw new Error(
        'TenantContext: tenantId no está resuelto. Toda ruta autenticada debe pasar por TenantInterceptor.',
      );
    }
    return this._tenantId as string;
  }

  get tenantIdOrNull(): string | null {
    return this._tenantId;
  }

  get userId(): string | null {
    return this._userId;
  }

  get isSuperAdmin(): boolean {
    return this._isSuperAdmin;
  }

  hasTenant(): boolean {
    return !!this._tenantId;
  }
}
