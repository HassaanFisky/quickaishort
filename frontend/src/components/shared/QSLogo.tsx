"use client";

import { cn } from "@/lib/utils";

/**
 * QSLogo — official QuickAI Studio vector brand mark & wordmark.
 *   variant="mark"     → vector Studio emblem only
 *   variant="full"     → vector Studio emblem + "QuickAI Studio" wordmark
 *   variant="wordmark" → "QuickAI Studio" wordmark text only
 */

type Size = "sm" | "md" | "lg" | "xl";
type Variant = "mark" | "full" | "wordmark";

interface QSLogoProps {
  size?: Size;
  variant?: Variant;
  /** Adds a subtle hover-scale on the mark. */
  animated?: boolean;
  className?: string;
}

const SIZE_PX: Record<Size, number> = { sm: 26, md: 32, lg: 56, xl: 96 };
const TEXT_PX: Record<Size, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-2xl",
  xl: "text-4xl",
};

function Mark({ pixelSize, animated }: { pixelSize: number; animated: boolean }) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center qs-logo-mark select-none",
        animated && "transition-transform duration-300 hover:scale-105",
      )}
      style={{ width: pixelSize, height: pixelSize }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-[0_2px_10px_rgba(168,85,247,0.28)]"
      >
        <defs>
          <linearGradient
            id="qai-studio-mark-grad"
            x1="12"
            y1="12"
            x2="108"
            y2="108"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="52%" stopColor="#A855F7" />
            <stop offset="100%" stopColor="#EC4899" />
          </linearGradient>
          <linearGradient
            id="qai-studio-mark-inner"
            x1="30"
            y1="24"
            x2="92"
            y2="96"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="50%" stopColor="#C084FC" />
            <stop offset="100%" stopColor="#F472B6" />
          </linearGradient>
        </defs>
        <rect
          x="8"
          y="8"
          width="104"
          height="104"
          rx="28"
          fill="#07070C"
          stroke="url(#qai-studio-mark-grad)"
          strokeWidth="4.5"
        />
        <rect
          x="16"
          y="16"
          width="88"
          height="88"
          rx="22"
          fill="url(#qai-studio-mark-grad)"
          fillOpacity="0.12"
        />
        <path
          d="M44 36.5C44 33.4624 47.2725 31.5504 49.9182 33.0419L82.5849 51.4581C85.2768 52.9756 85.2768 56.8511 82.5849 58.3686L49.9182 76.7848C47.2725 78.2763 44 76.3643 44 73.3267V36.5Z"
          fill="url(#qai-studio-mark-inner)"
        />
        <path
          d="M34 84L86 84"
          stroke="url(#qai-studio-mark-grad)"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <circle
          cx="66"
          cy="84"
          r="5"
          fill="#F8FAFC"
          stroke="#A855F7"
          strokeWidth="2.5"
        />
        <path
          d="M88 26L91 33L98 36L91 39L88 46L85 39L78 36L85 33L88 26Z"
          fill="#60A5FA"
        />
      </svg>
    </span>
  );
}

function Wordmark({ size }: { size: Size }) {
  return (
    <span
      className={cn(
        "font-extrabold tracking-tight leading-none select-none inline-flex items-baseline gap-1",
        TEXT_PX[size],
      )}
      style={{ letterSpacing: "-0.03em" }}
    >
      <span>
        <span className="text-foreground">Quick</span>
        <span
          className="bg-clip-text text-transparent"
          style={{
            backgroundImage:
              "linear-gradient(135deg, #3b82f6 0%, #a855f7 60%, #ec4899 100%)",
          }}
        >
          AI
        </span>
      </span>
      <span className="text-foreground font-semibold tracking-normal">Studio</span>
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
