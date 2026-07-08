'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { PlatformSidebar } from '@/components/layout/PlatformSidebar';
import { Loader2 } from 'lucide-react';

export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated, initialize } = useAuthStore();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    initialize();
    setChecked(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!checked) return;
    if (!isAuthenticated || !user) {
      router.replace('/platform/login');
      return;
    }
    if (user.tenantId) {
      // Un usuario de un tenant nunca debe ver el panel de plataforma.
      router.replace('/dashboard');
    }
  }, [checked, isAuthenticated, user, router]);

  if (!checked || !isAuthenticated || !user || user.tenantId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Loader2 className="w-8 h-8 text-gray-700 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 lg:pl-64">
      <PlatformSidebar />
      <main className="p-6 lg:p-8">{children}</main>
    </div>
  );
}
