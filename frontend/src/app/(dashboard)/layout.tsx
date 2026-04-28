import Sidebar from "@/components/layout/Sidebar";
import Footer from "@/components/layout/Footer";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background relative selection:bg-primary/30 overflow-x-hidden">
      {/* Background radial glow - theme aware */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(var(--primary)/0.03),transparent_50%)] pointer-events-none" />

      <Sidebar />
      <main className="flex-1 pt-6 md:pt-0 pb-32 md:pb-0 md:pl-28 md:pr-8 animate-in fade-in duration-1000">
        {children}
      </main>
      <div className="md:pl-28 pb-24 md:pb-8 opacity-40 hover:opacity-100 transition-opacity duration-500">
        <Footer />
      </div>
    </div>
  );
}
