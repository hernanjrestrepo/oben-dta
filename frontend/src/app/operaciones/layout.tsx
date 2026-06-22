import { Sidebar } from '@/components/layout/Sidebar';

export default function OperacionesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0b1220] lg:pl-64">
      <Sidebar />
      <main className="p-6 lg:p-8">{children}</main>
    </div>
  );
}
