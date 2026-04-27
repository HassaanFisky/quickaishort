import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1.5 [&>svg]:pointer-events-none transition-all duration-300 overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-primary/20 bg-primary/10 text-primary shadow-[0_0_20px_rgba(33,150,243,0.1)]",
        secondary: "border-white/5 bg-white/5 text-muted-foreground/80",
        destructive:
          "border-destructive/20 bg-destructive/10 text-destructive shadow-[0_0_20px_rgba(239,68,68,0.1)]",
        outline:
          "border-white/10 bg-transparent text-foreground hover:bg-white/5",
        premium:
          "border-primary/30 bg-linear-to-r from-primary/20 to-secondary/20 text-white shadow-[0_0_30px_rgba(33,150,243,0.2)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
