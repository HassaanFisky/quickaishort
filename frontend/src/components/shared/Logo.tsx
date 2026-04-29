import Link from "next/link";
import QSLogo from "./QSLogo";

/**
 * Shared Logo component used across the application.
 * Wraps the premium QSLogo SVG component.
 */
export default function Logo() {
  return (
    <Link href="/" className="flex items-center group">
      <QSLogo variant="full" size="md" animated className="group-hover:scale-[1.02] transition-transform duration-300" />
    </Link>
  );
}
