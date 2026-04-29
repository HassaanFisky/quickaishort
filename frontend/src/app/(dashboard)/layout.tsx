import Sidebar from "@/components/layout/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="md:pl-[240px]">
        <div className="mx-auto max-w-[1280px] px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
