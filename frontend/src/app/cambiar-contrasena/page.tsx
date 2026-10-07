'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export default function CambiarContrasenaPage() {
  const router = useRouter();
  // Se lee de la sesión guardada en el navegador (en el servidor siempre es false).
  const obligatorio = useSyncExternalStore(
    () => () => undefined,
    () => !!api.getUser()?.mustChangePassword,
    () => false,
  );
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!api.getUser()) router.replace('/login?redirect=/cambiar-contrasena');
  }, [router]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (nueva.length < 8) return setError('La nueva contraseña debe tener al menos 8 caracteres.');
    if (nueva !== confirmar) return setError('La confirmación no coincide con la nueva contraseña.');
    if (nueva === actual) return setError('La nueva contraseña debe ser distinta de la actual.');
    setGuardando(true);
    try {
      const res = await api.changePassword(actual, nueva);
      useAuthStore.setState({ user: res.user, isAuthenticated: true });
      router.replace('/operaciones');
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError((Array.isArray(msg) ? msg.join(' ') : msg) || 'No se pudo cambiar la contraseña.');
    } finally {
      setGuardando(false);
    }
  }

  const campo =
    'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F47735] focus:border-[#F47735] outline-none transition';

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F47735] to-[#E5641F] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-oben.svg" alt="Oben" className="h-12 w-auto mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white">OBEN XMART</h1>
        </div>
        <form onSubmit={guardar} className="bg-white rounded-2xl shadow-2xl p-8 space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#F47735]" />
            Cambiar contraseña
          </h2>
          {obligatorio && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Entraste con una contraseña temporal. Para continuar, crea tu propia contraseña.
            </p>
          )}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña actual{obligatorio ? ' (la temporal)' : ''}</label>
            <input type={ver ? 'text' : 'password'} value={actual} onChange={(e) => setActual(e.target.value)} className={campo} autoComplete="current-password" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña (mínimo 8 caracteres)</label>
            <input type={ver ? 'text' : 'password'} value={nueva} onChange={(e) => setNueva(e.target.value)} className={campo} autoComplete="new-password" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar nueva contraseña</label>
            <input type={ver ? 'text' : 'password'} value={confirmar} onChange={(e) => setConfirmar(e.target.value)} className={campo} autoComplete="new-password" required />
          </div>
          <button type="button" onClick={() => setVer((v) => !v)} className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1.5">
            {ver ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />} {ver ? 'Ocultar' : 'Mostrar'} contraseñas
          </button>
          <button
            type="submit"
            disabled={guardando}
            className="w-full py-3 bg-[#F47735] hover:bg-[#E5641F] text-white rounded-lg font-semibold transition flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar contraseña
          </button>
          {!obligatorio && (
            <button type="button" onClick={() => router.back()} className="w-full text-sm text-gray-500 hover:text-gray-700">
              Cancelar
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
