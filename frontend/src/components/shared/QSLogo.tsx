"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * QSLogo — official brand mark assets (no coded SVG glyph).
 *   variant="mark"     → theme-aware mark only (no wordmark text in the PNG)
 *   variant="full"     → mark + "QuickAI Short" wordmark (HTML text)
 *   variant="wordmark" → wordmark text only
 *
 * Light theme uses qs-logo-mark-light.png so the mark does not fade on pale UI.
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
  const common = cn(
    "object-contain select-none",
    animated && "transition-transform duration-300 hover:scale-110",
  );
  return (
    <span className="relative inline-flex shrink-0" style={{ width: pixelSize, height: pixelSize }}>
      {/* Dark / OLED — bright mark on black plate */}
      <Image
        src="/qs-logo-mark-dark.png"
        alt="QuickAI Short"
        width={pixelSize}
        height={pixelSize}
        priority
        className={cn(common, "hidden dark:block")}
      />
      {/* Light — contrast-safe mark on pale plate */}
      <Image
        src="/qs-logo-mark-light.png"
        alt="QuickAI Short"
        width={pixelSize}
        height={pixelSize}
        priority
        className={cn(common, "block dark:hidden")}
      />
    </span>
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
      <span className="text-foreground">Quick</span>
      <span
        className="bg-clip-text text-transparent"
        style={{
          backgroundImage:
            "linear-gradient(135deg, #3b82f6 0%, #a855f7 60%, #ec4899 100%)",
        }}
      >
        AI
      </span>{" "}
      <span className="text-foreground">Short</span>
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
