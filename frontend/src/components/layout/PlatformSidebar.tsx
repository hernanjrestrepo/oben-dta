'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import {
  LayoutDashboard,
  Building2,
  Package,
  Users,
  ScrollText,
  LogOut,
  ChevronRight,
  Menu,
  X,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { href: '/platform', label: 'Estado del sistema', icon: LayoutDashboard },
  { href: '/platform/tenants', label: 'Empresas (Tenants)', icon: Building2 },
  { href: '/platform/plans', label: 'Planes', icon: Package },
  { href: '/platform/users', label: 'Usuarios plataforma', icon: Users },
  { href: '/platform/audit', label: 'Auditoría', icon: ScrollText },
];

export function PlatformSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 bg-gray-900 text-white p-2 rounded-lg shadow-lg"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-gray-900 text-white transform transition-transform duration-300 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-gray-900" />
              </div>
              <div>
                <h1 className="font-bold text-lg">Paradixe</h1>
                <p className="text-xs text-gray-400">Panel SuperAdmin</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/platform' && pathname?.startsWith(`${item.href}/`));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition group ${
                    isActive ? 'bg-white/15 text-white font-semibold' : 'text-gray-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                  {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-white/10">
            {user && (
              <div className="mb-3 px-2">
                <p className="text-sm font-medium truncate">{user.firstName} {user.lastName}</p>
                <p className="text-xs text-gray-400 truncate">{user.email}</p>
              </div>
            )}
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10 hover:text-white transition"
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
