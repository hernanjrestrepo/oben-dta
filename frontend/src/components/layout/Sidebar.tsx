'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  LogOut,
  ChevronRight,
  Menu,
  X,
  Activity,
  FileText,
  Mail,
  ShieldCheck,
  History,
  Truck,
  Package,
  Users2,
  FileSpreadsheet,
  Briefcase,
  ArrowRightLeft,
  Receipt,
  UserCog,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { href: '/operaciones', label: 'Centro de Operaciones', icon: Activity },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/comercial', label: 'Comercial', icon: Briefcase },
  { href: '/quotes', label: 'Cotizaciones', icon: Mail },
  { href: '/orders', label: 'Órdenes', icon: ShoppingCart },
  { href: '/invoices', label: 'Facturas', icon: FileText },
  { href: '/fletes', label: 'Fletes', icon: Truck },
  { href: '/lista-empaque', label: 'Lista de Empaque', icon: Package },
  { href: '/facturacion', label: 'Liquidación y Facturación', icon: Receipt },
  { href: '/reportes', label: 'Reportes Oben', icon: FileSpreadsheet },
  { href: '/clients', label: 'Clientes', icon: Users },
  { href: '/equivalencias', label: 'Equivalencias', icon: ArrowRightLeft },
  { href: '/distribucion', label: 'Listas de Distribución', icon: Users2 },
];

const usersNavItem = { href: '/admin/users', label: 'Usuarios', icon: UserCog };
const rolesNavItem = { href: '/admin/roles', label: 'Perfiles', icon: ShieldCheck };
const auditNavItem = { href: '/auditoria', label: 'Auditoría', icon: History };

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const canManageUsers = user?.permissions?.includes('users.read');
  const canManageRoles = user?.permissions?.includes('security.read');
  const canViewAudit = user?.permissions?.includes('auditoria.read');
  const items = [
    ...navItems,
    ...(canViewAudit ? [auditNavItem] : []),
    ...(canManageUsers ? [usersNavItem] : []),
    ...(canManageRoles ? [rolesNavItem] : []),
  ];

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 bg-[#F47735] text-white p-2 rounded-lg shadow-lg"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#F47735] text-white transform transition-transform duration-300 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="px-6 py-5 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-oben.svg" alt="Oben" className="h-8 w-auto shrink-0" />
              <div>
                <h1 className="font-bold text-lg">OBEN XMART</h1>
                <p className="text-xs text-white/70">Digitalización Autónoma</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          {/* min-h-0 + overflow: con 17 opciones el menú no cabe en pantallas
              de laptop y las últimas (Usuarios, Perfiles) quedaban fuera de
              la ventana sin forma de llegar a ellas (reporte 2026-10-01). */}
          <nav className="sidebar-scroll flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-0.5">
            {items.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2 rounded-lg transition group ${
                    isActive
                      ? 'bg-white/15 text-white font-semibold'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="leading-tight">{item.label}</span>
                  {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
                </Link>
              );
            })}
          </nav>

          {/* User + Logout */}
          <div className="p-4 border-t border-white/10 shrink-0">
            {user && (
              <div className="mb-3 px-2">
                <p className="text-sm font-medium truncate">{user.firstName} {user.lastName}</p>
                <p className="text-xs text-white/70 truncate">{user.email}</p>
              </div>
            )}
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition"
            >
              <LogOut className="w-5 h-5" />
              <span>Cerrar Sesión</span>
            </button>
            <a
              href="https://www.paradixe.xyz/"
              target="_blank"
              rel="noopener"
              className="block mt-3 px-2 text-[10px] text-white/60 text-center hover:text-white transition"
            >
              Oben Xmart by Paradixe
            </a>
          </div>
        </div>
      </aside>
    </>
  );
}
