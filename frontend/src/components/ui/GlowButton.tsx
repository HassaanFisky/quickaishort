"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const glowButtonVariants = cva(
  [
    "inline-flex items-center justify-center whitespace-nowrap rounded-xl",
    "text-sm font-bold ring-offset-background",
    "transition-[transform,box-shadow,background-color,opacity]",
    "focus-visible:outline-none focus-visible:ring-0",
    "focus-visible:[box-shadow:0_0_0_2px_#020203,_0_0_0_4px_rgba(168,85,247,0.6)]",
    "disabled:pointer-events-none disabled:opacity-40",
    "active:scale-[0.97]",
  ].join(" "),
  {
    variants: {
      variant: {
        // Purple primary
        default:
          "bg-primary text-primary-foreground shadow-[0_4px_16px_-4px_rgba(168,85,247,0.4)] hover:shadow-[0_8px_24px_-4px_rgba(168,85,247,0.5)] hover:brightness-110 hover:-translate-y-[1px]",
        // Blue → purple → pink brand gradient (highest-value CTA)
        gradient:
          "text-white shadow-[0_4px_20px_-4px_rgba(168,85,247,0.45)] hover:shadow-[0_8px_32px_-4px_rgba(168,85,247,0.55)] hover:-translate-y-[2px] border border-white/10",
        // Outlined glass
        outline:
          "border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 text-foreground hover:-translate-y-[1px]",
        // Standard glassmorphism
        glass:
          "glass text-white hover:bg-white/10 border-white/10 hover:-translate-y-[1px]",
        ghost:
          "hover:bg-white/6 hover:text-foreground text-muted-foreground",
        link:
          "text-primary underline-offset-4 hover:underline p-0 h-auto",
        // Blue-to-purple gradient with top-border highlight
        premium:
          "bg-gradient-to-b from-primary to-blue-700 text-white shadow-[0_4px_20px_-4px_rgba(59,130,246,0.4)] hover:shadow-[0_8px_28px_-4px_rgba(59,130,246,0.5)] hover:-translate-y-[1px] border-t border-white/20",
        // Destructive
        destructive:
          "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/15 hover:border-red-500/30",
      },
      size: {
        default: "h-11 px-6 py-2",
        sm:      "h-9 rounded-lg px-4 text-xs",
        lg:      "h-14 px-10 text-base rounded-2xl",
        xl:      "h-16 px-12 text-lg rounded-2xl",
        icon:    "h-10 w-10 rounded-xl",
        "icon-sm": "h-8 w-8 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface GlowButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof glowButtonVariants> {
  asChild?: boolean;
}

const GlowButton = React.forwardRef<HTMLButtonElement, GlowButtonProps>(
  ({ className, variant, size, asChild = false, style, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    const gradientStyle =
      variant === "gradient"
        ? {
            background: "linear-gradient(135deg, #3b82f6 0%, #a855f7 55%, #ec4899 100%)",
            ...style,
          }
        : style;

    return (
      <Comp
        className={cn(
          glowButtonVariants({ variant, size }),
          "duration-[160ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]",
          className,
        )}
        style={gradientStyle}
        ref={ref}
        {...props}
      />
    );
  },
);
GlowButton.displayName = "GlowButton";

export { GlowButton, glowButtonVariants };
