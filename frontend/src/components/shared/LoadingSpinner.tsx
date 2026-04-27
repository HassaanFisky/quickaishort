import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  className?: string;
  size?: number;
}

export default function LoadingSpinner({
  className,
  size = 24,
}: LoadingSpinnerProps) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <Loader2
        className="animate-spin text-primary"
        style={{ width: size, height: size }}
      />
    </div>
  );
}
