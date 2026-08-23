import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-[#F47735] flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-white animate-spin" />
        </div>
        <p className="text-sm text-gray-500">Cargando…</p>
      </div>
    </div>
  );
}
