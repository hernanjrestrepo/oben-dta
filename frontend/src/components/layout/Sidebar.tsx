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
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { href: '/operaciones', label: 'Centro de Operaciones', icon: Activity },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/quotes', label: 'Cotizaciones', icon: Mail },
  { href: '/orders', label: 'Órdenes', icon: ShoppingCart },
  { href: '/invoices', label: 'Facturas', icon: FileText },
  { href: '/clients', label: 'Clientes', icon: Users },
];

const adminNavItem = { href: '/admin/users', label: 'Administración', icon: ShieldCheck };
const auditNavItem = { href: '/auditoria', label: 'Auditoría', icon: History };

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const canAdminister = user?.permissions?.includes('users.read');
  const canViewAudit = user?.permissions?.includes('auditoria.read');
  const items = [
    ...navItems,
    ...(canViewAudit ? [auditNavItem] : []),
    ...(canAdminister ? [adminNavItem] : []),
  ];

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 bg-[#003366] text-white p-2 rounded-lg shadow-lg"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#003366] text-white transform transition-transform duration-300 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                <span className="text-[#003366] font-bold text-lg">O</span>
              </div>
              <div>
                <h1 className="font-bold text-lg">OBEN DTA</h1>
                <p className="text-xs text-blue-200">Digitalización Autónoma</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1">
            {items.map((item) => {
              const isActive = item.href === '/admin/users'
                ? pathname?.startsWith('/admin')
                : pathname === item.href || pathname?.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition group ${
                    isActive
                      ? 'bg-white/15 text-white font-semibold'
                      : 'text-blue-200 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                  {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
                </Link>
              );
            })}
          </nav>

          {/* User + Logout */}
          <div className="p-4 border-t border-white/10">
            {user && (
              <div className="mb-3 px-2">
                <p className="text-sm font-medium truncate">{user.firstName} {user.lastName}</p>
                <p className="text-xs text-blue-200 truncate">{user.email}</p>
              </div>
            )}
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-blue-200 hover:bg-white/10 hover:text-white transition"
            >
              <LogOut className="w-5 h-5" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
