import { Loader2 } from 'lucide-react';

export default function RootLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#003366] to-[#004080] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center shadow-lg">
          <span className="text-[#003366] font-bold text-2xl">O</span>
        </div>
        <Loader2 className="w-6 h-6 text-white animate-spin" />
      </div>
    </div>
  );
}
