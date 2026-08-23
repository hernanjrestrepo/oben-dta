'use client';

import { Suspense } from 'react';
import { LoginForm } from './LoginForm';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-[#F47735] to-[#E5641F] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
