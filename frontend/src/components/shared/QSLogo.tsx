"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * QSLogo — renders the OFFICIAL public brand image (no coded/SVG logo).
 *   variant="mark"     → the metallic QS mark only            (public/qs-logo.png)
 *   variant="full"     → mark + "Quick AI Shorts" wordmark
 *   variant="wordmark" → wordmark text only
 * The brand glyph is always the public PNG asset — never a hand-drawn SVG.
 */

type Size = "sm" | "md" | "lg" | "xl";
type Variant = "mark" | "full" | "wordmark";

interface QSLogoProps {
  size?: Size;
  variant?: Variant;
  /** Adds a subtle hover-scale on the mark (kept for API compatibility). */
  animated?: boolean;
  className?: string;
}

const SIZE_PX: Record<Size, number> = { sm: 24, md: 32, lg: 56, xl: 96 };
const TEXT_PX: Record<Size, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-2xl",
  xl: "text-4xl",
};

function Mark({ pixelSize, animated }: { pixelSize: number; animated: boolean }) {
  return (
    <Image
      src="/qs-logo.png"
      alt="Quick AI Shorts"
      width={pixelSize}
      height={pixelSize}
      priority
      className={cn(
        "object-contain select-none",
        animated && "transition-transform duration-300 hover:scale-110",
      )}
    />
  );
}

function Wordmark({ size }: { size: Size }) {
  return (
    <span
      className={cn(
        "font-bold tracking-tight leading-none select-none",
        TEXT_PX[size],
      )}
      style={{ letterSpacing: "-0.03em" }}
    >
      Quick{" "}
      <span
        className="bg-clip-text text-transparent"
        style={{
          backgroundImage:
            "linear-gradient(135deg, #3b82f6 0%, #a855f7 60%, #ec4899 100%)",
        }}
      >
        AI
      </span>{" "}
      Shorts
    </span>
  );
}

export default function QSLogo({
  size = "md",
  variant = "mark",
  animated = false,
  className,
}: QSLogoProps) {
  const px = SIZE_PX[size];

  if (variant === "wordmark") {
    return (
      <span className={cn("inline-flex items-center", className)}>
        <Wordmark size={size} />
      </span>
    );
  }

  if (variant === "full") {
    return (
      <span className={cn("inline-flex items-center gap-2.5", className)}>
        <Mark pixelSize={px} animated={animated} />
        <Wordmark size={size} />
      </span>
    );
  }

  return (
    <span className={cn("inline-flex", className)}>
      <Mark pixelSize={px} animated={animated} />
    </span>
  );
}
