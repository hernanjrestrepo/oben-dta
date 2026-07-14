'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { LicenseStatusView } from '@/types';
import { AlertTriangle, ShieldAlert } from 'lucide-react';

const EXEMPT_PREFIXES = ['/login', '/platform'];

const REASON_LABELS: Record<string, string> = {
  no_license: 'Esta instalación no tiene una licencia emitida.',
  tampered: 'La licencia registrada no pudo verificarse (firma inválida).',
  expired: 'La licencia de esta empresa venció.',
  suspended: 'La licencia de esta empresa está suspendida.',
  revoked: 'La licencia de esta empresa fue revocada.',
  installation_mismatch: 'Esta licencia pertenece a otra instalación y no es válida aquí.',
};

/**
 * Bloquea el acceso operativo del tenant si la licencia no es válida. No borra
 * ni afecta datos ni configuraciones — solo impide el uso mientras la licencia
 * esté vencida/suspendida/revocada. Los usuarios de plataforma (SuperAdmin)
 * nunca pasan por este gate: su acceso vive en /platform y no depende de
 * ninguna licencia de tenant.
 */
export function LicenseGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isAuthenticated } = useAuthStore();
  const [status, setStatus] = useState<LicenseStatusView | null>(null);
  const [checked, setChecked] = useState(false);

  const exempt = EXEMPT_PREFIXES.some((p) => pathname?.startsWith(p));
  const applies = isAuthenticated && !!user?.tenantId && !exempt;

  useEffect(() => {
    if (!applies) {
      queueMicrotask(() => setChecked(true));
      return;
    }
    let cancelled = false;
    api
      .getLicenseStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [applies, user?.tenantId]);

  if (!applies || !checked || !status || status.valid) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8 text-red-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Licencia no disponible</h1>
        <p className="text-gray-600 mb-4">
          {REASON_LABELS[status.reason ?? ''] ?? 'No fue posible validar la licencia de esta empresa.'}
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 flex items-start gap-2 text-left mb-6">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Tus datos y configuraciones están intactos. Este bloqueo es únicamente operativo — contacta a tu proveedor para renovar la licencia y recuperar el acceso.</span>
        </div>
        {status.expiresAt && (
          <p className="text-xs text-gray-400">Fecha de vencimiento: {new Date(status.expiresAt).toLocaleDateString('es-CO')}</p>
        )}
      </div>
    </div>
  );
}
