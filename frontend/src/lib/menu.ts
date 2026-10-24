import {
  ArrowRightLeft,
  Briefcase,
  FilePenLine,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  History,
  LayoutDashboard,
  Mail,
  Package,
  PlugZap,
  Receipt,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  Users2,
  type LucideIcon,
} from 'lucide-react';

/**
 * Una opción del menú y lo que exige en el backend. Es la única fuente: el
 * menú se arma con esto y la pantalla de Perfiles también (reunión 22-oct:
 * "los perfiles igual a como está el menú, solo lectura o transaccional").
 */
export interface OpcionMenu {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Permisos para ver la opción y consultar su información (Solo lectura). */
  ver: string[];
  /** Permisos adicionales para crear, editar, enviar, aprobar o liquidar (Transaccional). Vacío = solo se consulta. */
  operar: string[];
}

export interface GrupoMenu {
  titulo: string;
  items: OpcionMenu[];
}

// Varias pantallas usan el mismo permiso del backend: se definen una vez para que vayan siempre juntas.
const ORDENES = { ver: ['orders.read'], operar: ['orders.create', 'orders.update', 'orders.delete', 'orders.approve', 'orders.cancel'] };
const FACTURAS = { ver: ['invoices.read'], operar: ['invoices.create', 'invoices.update', 'invoices.send'] };
const CONFIGURACION = { ver: ['configuracion.read'], operar: ['configuracion.update'] };

/** Menú agrupado por función (WO-028): cada grupo se puede plegar y recuerda su estado. */
export const MENU: GrupoMenu[] = [
  {
    titulo: 'Inicio',
    items: [
      // Centro de Operaciones oculto (Hernán, 24-oct: "confuso"); la página sigue existiendo para Paradixe.
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, ver: ['dashboard.view'], operar: [] },
    ],
  },
  {
    titulo: 'Comercial',
    items: [
      { href: '/comercial', label: 'Comercial', icon: Briefcase, ...ORDENES },
      { href: '/quotes', label: 'Cotizaciones', icon: Mail, ver: ['quotes.read'], operar: ['quotes.create', 'quotes.update', 'quotes.approve', 'quotes.delete'] },
      { href: '/orders', label: 'Órdenes', icon: ShoppingCart, ...ORDENES },
      { href: '/clients', label: 'Clientes', icon: Users, ver: ['clients.read'], operar: ['clients.create', 'clients.update', 'clients.delete'] },
      { href: '/equivalencias', label: 'Equivalencias', icon: ArrowRightLeft, ver: ['products.read'], operar: ['products.create', 'products.update', 'products.delete'] },
    ],
  },
  {
    titulo: 'Despacho y facturación',
    items: [
      { href: '/lista-empaque', label: 'Lista de Empaque', icon: Package, ...ORDENES },
      {
        href: '/facturacion',
        label: 'Liquidación y Facturación',
        icon: Receipt,
        ver: ['exportations.read', 'invoices.read'],
        operar: ['exportations.liquidate', 'exportations.approve', 'invoices.send'],
      },
      { href: '/cuadro-integracion', label: 'Cuadro de integración', icon: FileSpreadsheet, ver: ['exportations.read'], operar: [] },
      { href: '/facturas-parciales', label: 'Facturas parciales', icon: ReceiptText, ...FACTURAS },
      { href: '/invoices', label: 'Facturas', icon: FileText, ...FACTURAS },
      { href: '/fletes', label: 'Fletes', icon: Truck, ver: ['quotes.read'], operar: [] },
    ],
  },
  {
    titulo: 'Reportes',
    items: [{ href: '/reportes', label: 'Reportes Oben', icon: FileSpreadsheet, ...ORDENES }],
  },
  {
    titulo: 'Aprendizaje',
    // Para todos (sin permiso propio): cada persona ve su plan según su perfil. No se configura en Perfiles.
    items: [{ href: '/academy', label: 'Xmart Academy', icon: GraduationCap, ver: [], operar: [] }],
  },
  {
    titulo: 'Configuración',
    items: [
      // Cada dueño de lista (WO-026) cambia sus destinatarios sin permiso de configuración; crear o borrar listas sí lo exige.
      { href: '/distribucion', label: 'Listas de Distribución', icon: Users2, ver: ['dashboard.view'], operar: ['configuracion.update'] },
      { href: '/formatos', label: 'Formatos de correo', icon: FilePenLine, ...CONFIGURACION },
      { href: '/auditoria', label: 'Auditoría', icon: History, ver: ['auditoria.read'], operar: [] },
      { href: '/conexiones', label: 'Conexión Microsoft 365', icon: PlugZap, ver: ['integrations.read'], operar: [] },
      { href: '/admin/users', label: 'Usuarios', icon: UserCog, ver: ['users.read'], operar: ['users.create', 'users.update', 'users.delete'] },
      { href: '/admin/roles', label: 'Perfiles', icon: ShieldCheck, ver: ['security.read'], operar: ['security.create', 'security.update', 'security.delete'] },
    ],
  },
];

/** Opciones que se configuran en Perfiles: las que exigen algún permiso (Xmart Academy es para todos). */
export const OPCIONES_MENU: OpcionMenu[] = MENU.flatMap((g) => g.items).filter((o) => o.ver.length > 0 || o.operar.length > 0);

export type NivelAcceso = 'ninguno' | 'lectura' | 'transaccional';

export function puedeVer(opcion: OpcionMenu, permisos: readonly string[]): boolean {
  return opcion.ver.every((p) => permisos.includes(p));
}

/** Nivel de una opción según los permisos; `parcial` = tiene solo algunas de las acciones transaccionales. */
export function nivelOpcion(opcion: OpcionMenu, permisos: readonly string[]): { nivel: NivelAcceso; parcial: boolean } {
  if (!puedeVer(opcion, permisos)) return { nivel: 'ninguno', parcial: false };
  if (opcion.operar.length > 0 && opcion.operar.every((p) => permisos.includes(p))) return { nivel: 'transaccional', parcial: false };
  return { nivel: 'lectura', parcial: opcion.operar.some((p) => permisos.includes(p)) };
}

/** Permisos resultantes de poner una opción en un nivel (lo de las demás opciones no se toca). */
export function conNivel(permisos: readonly string[], opcion: OpcionMenu, nivel: NivelAcceso): string[] {
  const propios = [...opcion.ver, ...opcion.operar];
  const nuevos = nivel === 'ninguno' ? [] : nivel === 'lectura' ? opcion.ver : propios;
  return Array.from(new Set([...permisos.filter((p) => !propios.includes(p)), ...nuevos]));
}

/** Otras opciones que usan alguno de los mismos permisos: cambian junto con esta. */
export function compartenPermiso(opcion: OpcionMenu): OpcionMenu[] {
  const propios = new Set([...opcion.ver, ...opcion.operar]);
  return OPCIONES_MENU.filter((o) => o.href !== opcion.href && [...o.ver, ...o.operar].some((p) => propios.has(p)));
}

/** Permisos que cubre el menú (los demás del perfil se conservan tal cual al editarlo). */
export const PERMISOS_DEL_MENU = new Set(OPCIONES_MENU.flatMap((o) => [...o.ver, ...o.operar]));
