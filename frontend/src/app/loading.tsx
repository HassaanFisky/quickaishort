import QSLogo from "@/components/shared/QSLogo";

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse">
        <QSLogo variant="mark" size="lg" />
      </div>
    </div>
  );
}
