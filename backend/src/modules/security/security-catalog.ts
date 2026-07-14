/**
 * Catálogo semilla del sistema de seguridad.
 *
 * IMPORTANTE: Esto NO es la fuente de verdad. La fuente de verdad son las tablas
 * `modules`, `permissions`, `plans`, `plan_modules`, `platform_roles`. Este archivo
 * describe únicamente el "arranque conocido" del sistema: los módulos, permisos y
 * planes que existen en cualquier instalación limpia del producto. El bootstrap
 * hace UPSERT idempotente contra la BD.
 *
 * Un tenant puede crear sus propios roles y agrupar cualquier permiso del catálogo
 * global (o sus propios permisos custom si el operador de plataforma los agrega en BD).
 * Ningún runtime consulta este archivo — consulta la BD.
 */

export interface SeedModule {
  key: string;
  name: string;
  description: string;
  category:
    | 'platform'
    | 'core'
    | 'operations'
    | 'finance'
    | 'ai'
    | 'integrations';
}

export interface SeedPermission {
  key: string;
  moduleKey: string;
  action: string;
  name: string;
  description?: string;
  isPlatform?: boolean;
}

export interface SeedPlan {
  key: string;
  name: string;
  description: string;
  priceMonthly: number;
  currency: string;
  maxUsers: number;
  maxStorageGb: number;
  modules: string[];
}

export interface SeedPlatformRole {
  key: string;
  name: string;
  description: string;
  permissions: string[];
}

// --- Módulos base del sistema ---------------------------------------------

export const SEED_MODULES: SeedModule[] = [
  {
    key: 'platform',
    name: 'Platform Admin',
    description: 'Administración del SaaS',
    category: 'platform',
  },
  {
    key: 'users',
    name: 'Usuarios',
    description: 'Gestión de usuarios del tenant',
    category: 'core',
  },
  {
    key: 'security',
    name: 'Seguridad',
    description: 'Roles y permisos del tenant',
    category: 'core',
  },
  {
    key: 'clients',
    name: 'Clientes',
    description: 'CRUD de clientes',
    category: 'core',
  },
  {
    key: 'products',
    name: 'Productos',
    description: 'Catálogo de productos',
    category: 'core',
  },
  {
    key: 'orders',
    name: 'Órdenes',
    description: 'Órdenes de venta',
    category: 'operations',
  },
  {
    key: 'invoices',
    name: 'Facturas',
    description: 'Facturación',
    category: 'finance',
  },
  {
    key: 'quotes',
    name: 'Cotizaciones',
    description: 'Cotizaciones comerciales',
    category: 'operations',
  },
  {
    key: 'inventory',
    name: 'Inventario',
    description: 'Gestión de inventarios',
    category: 'operations',
  },
  {
    key: 'production',
    name: 'Producción',
    description: 'Órdenes de producción',
    category: 'operations',
  },
  {
    key: 'exportations',
    name: 'Exportaciones',
    description: 'Operaciones de exportación',
    category: 'operations',
  },
  {
    key: 'finance',
    name: 'Finanzas',
    description: 'Aprobaciones y contabilidad',
    category: 'finance',
  },
  {
    key: 'integrations',
    name: 'Integraciones',
    description: 'Integration Hub',
    category: 'integrations',
  },
  {
    key: 'automations',
    name: 'Automatizaciones',
    description: 'Motor de reglas',
    category: 'operations',
  },
  {
    key: 'reports',
    name: 'Reportes',
    description: 'BI y reportería',
    category: 'core',
  },
  {
    key: 'dashboard',
    name: 'Dashboard',
    description: 'KPIs en vivo',
    category: 'core',
  },
  {
    key: 'configuracion',
    name: 'Configuración',
    description: 'Ajustes generales del tenant',
    category: 'core',
  },
  {
    key: 'auditoria',
    name: 'Auditoría',
    description: 'Trazabilidad de acciones del tenant',
    category: 'core',
  },
  {
    key: 'licencias',
    name: 'Licencias',
    description: 'Estado y gestión de la licencia del tenant',
    category: 'core',
  },
];

// --- Permisos base --------------------------------------------------------

const CRUD_ACTIONS: Array<{ action: string; label: string }> = [
  { action: 'read', label: 'ver' },
  { action: 'create', label: 'crear' },
  { action: 'update', label: 'editar' },
  { action: 'delete', label: 'eliminar' },
];

const CRUD_MODULES = [
  'clients',
  'products',
  'orders',
  'invoices',
  'quotes',
  'inventory',
  'production',
  'exportations',
  'reports',
  'integrations',
  'automations',
  'users',
  'security',
];

function buildCrudPermissions(): SeedPermission[] {
  const out: SeedPermission[] = [];
  for (const moduleKey of CRUD_MODULES) {
    for (const { action, label } of CRUD_ACTIONS) {
      out.push({
        key: `${moduleKey}.${action}`,
        moduleKey,
        action,
        name: `${label} ${moduleKey}`,
      });
    }
  }
  return out;
}

const EXTRA_PERMISSIONS: SeedPermission[] = [
  {
    key: 'orders.approve',
    moduleKey: 'orders',
    action: 'approve',
    name: 'aprobar órdenes',
  },
  {
    key: 'orders.cancel',
    moduleKey: 'orders',
    action: 'cancel',
    name: 'cancelar órdenes',
  },
  {
    key: 'invoices.send',
    moduleKey: 'invoices',
    action: 'send',
    name: 'enviar facturas',
  },
  {
    key: 'invoices.mark_paid',
    moduleKey: 'invoices',
    action: 'mark_paid',
    name: 'marcar como pagada',
  },
  {
    key: 'quotes.approve',
    moduleKey: 'quotes',
    action: 'approve',
    name: 'aprobar cotizaciones',
  },
  {
    key: 'inventory.transfer',
    moduleKey: 'inventory',
    action: 'transfer',
    name: 'transferir inventario',
  },
  {
    key: 'inventory.adjust',
    moduleKey: 'inventory',
    action: 'adjust',
    name: 'ajustar inventario',
  },
  {
    key: 'finance.approve',
    moduleKey: 'finance',
    action: 'approve',
    name: 'aprobar operaciones financieras',
  },
  {
    key: 'finance.credit_validate',
    moduleKey: 'finance',
    action: 'credit_validate',
    name: 'validar crédito',
  },
  {
    key: 'production.execute',
    moduleKey: 'production',
    action: 'execute',
    name: 'ejecutar producción',
  },
  {
    key: 'production.schedule',
    moduleKey: 'production',
    action: 'schedule',
    name: 'programar producción',
  },
  {
    key: 'exportations.liquidate',
    moduleKey: 'exportations',
    action: 'liquidate',
    name: 'liquidar exportación',
  },
  {
    key: 'dashboard.view',
    moduleKey: 'dashboard',
    action: 'view',
    name: 'ver dashboard',
  },
  {
    key: 'configuracion.read',
    moduleKey: 'configuracion',
    action: 'read',
    name: 'ver configuración',
  },
  {
    key: 'configuracion.update',
    moduleKey: 'configuracion',
    action: 'update',
    name: 'editar configuración',
  },
  {
    key: 'auditoria.read',
    moduleKey: 'auditoria',
    action: 'read',
    name: 'ver auditoría del tenant',
  },
  {
    key: 'licencias.read',
    moduleKey: 'licencias',
    action: 'read',
    name: 'ver licencia del tenant',
  },
  {
    key: 'automations.execute',
    moduleKey: 'automations',
    action: 'execute',
    name: 'ejecutar automatización',
  },

  // Permisos de plataforma (Nivel 1)
  {
    key: 'platform.tenants.read',
    moduleKey: 'platform',
    action: 'tenants.read',
    name: 'ver tenants',
    isPlatform: true,
  },
  {
    key: 'platform.tenants.manage',
    moduleKey: 'platform',
    action: 'tenants.manage',
    name: 'administrar tenants',
    isPlatform: true,
  },
  {
    key: 'platform.plans.manage',
    moduleKey: 'platform',
    action: 'plans.manage',
    name: 'administrar planes',
    isPlatform: true,
  },
  {
    key: 'platform.subscriptions.manage',
    moduleKey: 'platform',
    action: 'subscriptions.manage',
    name: 'administrar suscripciones',
    isPlatform: true,
  },
  {
    key: 'platform.feature_flags.manage',
    moduleKey: 'platform',
    action: 'feature_flags.manage',
    name: 'administrar feature flags',
    isPlatform: true,
  },
  {
    key: 'platform.permissions.manage',
    moduleKey: 'platform',
    action: 'permissions.manage',
    name: 'administrar catálogo de permisos',
    isPlatform: true,
  },
  {
    key: 'platform.modules.manage',
    moduleKey: 'platform',
    action: 'modules.manage',
    name: 'administrar catálogo de módulos',
    isPlatform: true,
  },
  {
    key: 'platform.audit.read',
    moduleKey: 'platform',
    action: 'audit.read',
    name: 'auditoría de plataforma',
    isPlatform: true,
  },
  {
    key: 'platform.support.impersonate',
    moduleKey: 'platform',
    action: 'support.impersonate',
    name: 'impersonar tenant (soporte)',
    isPlatform: true,
  },
  {
    key: 'platform.users.read',
    moduleKey: 'platform',
    action: 'users.read',
    name: 'ver usuarios de plataforma',
    isPlatform: true,
  },
  {
    key: 'platform.users.manage',
    moduleKey: 'platform',
    action: 'users.manage',
    name: 'administrar usuarios de plataforma',
    isPlatform: true,
  },
  {
    key: 'platform.system.read',
    moduleKey: 'platform',
    action: 'system.read',
    name: 'ver estado del sistema',
    isPlatform: true,
  },
];

export const SEED_PERMISSIONS: SeedPermission[] = [
  ...buildCrudPermissions(),
  ...EXTRA_PERMISSIONS,
];

// --- Planes SaaS ----------------------------------------------------------

export const SEED_PLANS: SeedPlan[] = [
  {
    key: 'starter',
    name: 'Starter',
    description: 'Núcleo comercial para pymes',
    priceMonthly: 199,
    currency: 'USD',
    maxUsers: 10,
    maxStorageGb: 5,
    modules: [
      'clients',
      'products',
      'orders',
      'quotes',
      'invoices',
      'dashboard',
      'users',
      'security',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    description: 'Operación completa multi-área',
    priceMonthly: 599,
    currency: 'USD',
    maxUsers: 50,
    maxStorageGb: 25,
    modules: [
      'clients',
      'products',
      'orders',
      'quotes',
      'invoices',
      'dashboard',
      'users',
      'security',
      'inventory',
      'reports',
      'integrations',
      'finance',
    ],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    description: 'Toda la plataforma incluyendo automatización comercial',
    priceMonthly: 1499,
    currency: 'USD',
    maxUsers: 500,
    maxStorageGb: 250,
    modules: [
      'clients',
      'products',
      'orders',
      'quotes',
      'invoices',
      'dashboard',
      'users',
      'security',
      'inventory',
      'reports',
      'integrations',
      'finance',
      'production',
      'exportations',
      'automations',
    ],
  },
];

// --- Roles de plataforma (Paradixe) ---------------------------------------

export const SEED_PLATFORM_ROLES: SeedPlatformRole[] = [
  {
    key: 'platform.superadmin',
    name: 'Super Administrador',
    description: 'Control total sobre la plataforma y todos los tenants',
    permissions: EXTRA_PERMISSIONS.filter((p) => p.isPlatform).map(
      (p) => p.key,
    ),
  },
  {
    key: 'platform.support',
    name: 'Soporte',
    description:
      'Puede leer tenants, auditoría y usar impersonación controlada',
    permissions: [
      'platform.tenants.read',
      'platform.audit.read',
      'platform.support.impersonate',
      'platform.system.read',
    ],
  },
  {
    key: 'platform.auditor',
    name: 'Auditor',
    description: 'Solo lectura de auditoría y tenants',
    permissions: [
      'platform.tenants.read',
      'platform.audit.read',
      'platform.system.read',
    ],
  },
];

// --- Roles semilla por tenant (opcionales, editables por el tenant) -------

export interface SeedTenantRole {
  key: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
}

export const SEED_TENANT_ROLES: SeedTenantRole[] = [
  {
    key: 'tenant.admin',
    name: 'Administrador',
    description: 'Todos los permisos operativos del tenant',
    isSystem: true,
    permissions: SEED_PERMISSIONS.filter((p) => !p.isPlatform).map(
      (p) => p.key,
    ),
  },
  {
    key: 'tenant.viewer',
    name: 'Solo lectura',
    description: 'Puede ver información pero no modificarla',
    isSystem: true,
    permissions: SEED_PERMISSIONS.filter(
      (p) =>
        !p.isPlatform &&
        (p.action === 'read' || p.action === 'view' || p.action === 'ask'),
    ).map((p) => p.key),
  },
];
