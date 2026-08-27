import { Sidebar } from '@/components/layout/Sidebar';
import { EvaWidget } from '@/components/layout/EvaWidget';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F5F7FA] lg:pl-64">
      <Sidebar />
      <main className="p-6 lg:p-8">{children}</main>
      <EvaWidget />
    </div>
  );
}
