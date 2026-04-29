import Link from "next/link";
import QSLogo from "@/components/shared/QSLogo";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <QSLogo variant="mark" size="xl" />
      <p className="mt-10 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        Error 404
      </p>
      <h1 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">
        This page slipped past the algorithm.
      </h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        The route you tried to reach doesn&apos;t exist — or it moved while you were
        loading.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex h-11 items-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
      >
        Go home
      </Link>
    </div>
  );
}
