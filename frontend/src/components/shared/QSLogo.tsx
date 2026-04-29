"use client";

import { useId } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg" | "xl";
type Variant = "mark" | "full" | "wordmark";

interface QSLogoProps {
  size?: Size;
  variant?: Variant;
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
  const uid = useId().replace(/[:]/g, "");
  const gradId = `qs-grad-${uid}`;
  const trailId = `qs-trail-${uid}`;
  const blueId = `qs-blue-${uid}`;
  const purpleId = `qs-purple-${uid}`;

  return (
    <svg
      width={pixelSize}
      height={pixelSize}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Quick AI Shorts"
      className={cn(
        "qs-mark transition-[filter] duration-500",
        animated && "qs-mark-animated",
      )}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="60%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
        <linearGradient id={blueId} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
        <linearGradient id={purpleId} x1="100" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ec4899" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <linearGradient id={trailId} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0" />
          <stop offset="50%" stopColor="#a855f7" stopOpacity="1" />
          <stop offset="100%" stopColor="#ec4899" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Outer rounded-square Q ring (blue) */}
      <path
        d="M22 18 H62 a14 14 0 0 1 14 14 V60 a14 14 0 0 1 -14 14 H32 a14 14 0 0 1 -14 -14 V32 a14 14 0 0 1 14 -14 Z"
        stroke={`url(#${blueId})`}
        strokeWidth="3.5"
        fill="none"
      />
      {/* Inner Q tail (small slash bottom-right of Q) */}
      <path
        d="M58 64 L72 78"
        stroke={`url(#${blueId})`}
        strokeWidth="3.5"
        strokeLinecap="round"
      />

      {/* S-curve in purple, overlapping the right of the Q */}
      <path
        d="M78 36
           C 78 28, 72 24, 64 24
           C 56 24, 50 30, 50 38
           C 50 46, 56 50, 64 52
           C 72 54, 78 58, 78 66
           C 78 74, 72 80, 64 80
           C 56 80, 50 76, 50 68"
        stroke={`url(#${purpleId})`}
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />

      {/* Diagonal speed-trail */}
      <path
        className="qs-speed-trail"
        d="M82 14 L98 30"
        stroke={`url(#${trailId})`}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        className="qs-speed-trail qs-speed-trail-2"
        d="M70 6 L86 22"
        stroke={`url(#${trailId})`}
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />

      <style jsx>{`
        .qs-speed-trail {
          stroke-dasharray: 30;
          stroke-dashoffset: ${animated ? 30 : 0};
        }
        .qs-mark-animated .qs-speed-trail {
          animation: qs-draw 400ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        .qs-mark-animated .qs-speed-trail-2 {
          animation-delay: 120ms;
        }
        .qs-mark-animated:hover {
          filter: hue-rotate(10deg);
          transition: filter 2s ease;
        }
        @keyframes qs-draw {
          to {
            stroke-dashoffset: 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .qs-speed-trail {
            stroke-dashoffset: 0 !important;
            animation: none !important;
          }
          .qs-mark-animated:hover {
            filter: none;
          }
        }
      `}</style>
    </svg>
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
      <span className={cn("inline-flex items-center gap-3", className)}>
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
