import Link from "next/link";
import Image from "next/image";

export default function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 select-none group">
      <div className="relative w-7 h-7 group-hover:scale-105 interactive shine-effect rounded-lg overflow-hidden flex items-center justify-center">
        <Image
          src="/qs-logo.png"
          alt="QuickAI Shorts Logo"
          fill
          className="object-contain"
          priority
        />
      </div>
      <span className="font-semibold text-base tracking-tight text-foreground group-hover:text-primary interactive">
        QuickAI Shorts
      </span>
    </Link>
  );
}
