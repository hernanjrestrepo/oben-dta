'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

/**
 * Si el usuario entró con una contraseña temporal, no lo deja usar ninguna
 * pantalla hasta cambiarla (el backend además bloquea las rutas de negocio).
 */
export function ContrasenaTemporalGuard() {
  const router = useRouter();
  useEffect(() => {
    if (api.getUser()?.mustChangePassword) router.replace('/cambiar-contrasena');
  }, [router]);
  return null;
}
