'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { LogOut, ChevronRight, ChevronDown, Menu, X, KeyRound } from 'lucide-react';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { MENU, puedeVer } from '@/lib/menu';

const PLEGADOS_KEY = 'oben-xmart.menu.plegados';
const PLEGADOS_EVENTO = 'oben-xmart:menu-plegados';

/** Preferencia por navegador (grupos plegados); sin almacenamiento disponible, todo abierto. */
function leerPlegados(): string {
  try {
    return localStorage.getItem(PLEGADOS_KEY) ?? '[]';
  } catch {
    return '[]';
  }
}
function suscribir(cb: () => void): () => void {
  window.addEventListener('storage', cb);
  window.addEventListener(PLEGADOS_EVENTO, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(PLEGADOS_EVENTO, cb);
  };
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, refreshPermissions } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  // El menú sigue al perfil: si un administrador lo cambió, se ve al recargar sin volver a iniciar sesión.
  useEffect(() => {
    void refreshPermissions();
  }, [refreshPermissions]);
  const plegadosRaw = useSyncExternalStore(suscribir, leerPlegados, () => '[]');
  const plegados = useMemo<string[]>(() => {
    try {
      const v = JSON.parse(plegadosRaw);
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }, [plegadosRaw]);

  function alternar(titulo: string) {
    const n = plegados.includes(titulo) ? plegados.filter((t) => t !== titulo) : [...plegados, titulo];
    try {
      localStorage.setItem(PLEGADOS_KEY, JSON.stringify(n));
      window.dispatchEvent(new Event(PLEGADOS_EVENTO));
    } catch {
      /* almacenamiento no disponible */
    }
  }

  const esActivo = (href: string) => pathname === href || !!pathname?.startsWith(`${href}/`);
  const grupos = MENU.map((g) => ({
    ...g,
    items: g.items.filter((i) => puedeVer(i, user?.permissions ?? [])),
  })).filter((g) => g.items.length > 0);

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
          {/* min-h-0 + overflow: en pantallas bajas el menú hace scroll en vez
              de dejar opciones fuera de la ventana (reporte 2026-10-01). */}
          <nav className="sidebar-scroll flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
            {grupos.map((g) => {
              // Un grupo con la pantalla actual nunca queda plegado.
              const abierto = !plegados.includes(g.titulo) || g.items.some((i) => esActivo(i.href));
              return (
                <div key={g.titulo}>
                  <button
                    onClick={() => alternar(g.titulo)}
                    className="w-full flex items-center justify-between px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/60 hover:text-white"
                  >
                    {g.titulo}
                    <ChevronDown className={`w-3.5 h-3.5 transition ${abierto ? '' : '-rotate-90'}`} />
                  </button>
                  {abierto && (
                    <div className="mt-0.5 space-y-0.5">
                      {g.items.map((item) => {
                        const isActive = esActivo(item.href);
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            className={`flex items-center gap-3 px-3 py-1.5 rounded-lg transition group ${
                              isActive ? 'bg-white/15 text-white font-semibold' : 'text-white/75 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            <Icon className="w-[18px] h-[18px] shrink-0" />
                            <span className="leading-tight">{item.label}</span>
                            {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
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
            <Link
              href="/cambiar-contrasena"
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition"
            >
              <KeyRound className="w-5 h-5" />
              <span>Cambiar contraseña</span>
            </Link>
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
