import Sidebar from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <MainContent>
        <div className="mx-auto max-w-[1280px] px-6 py-6">{children}</div>
      </MainContent>
    </div>
  );
}
