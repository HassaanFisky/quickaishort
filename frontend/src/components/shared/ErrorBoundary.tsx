"use client";

import { Component, ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCcw, LayoutGrid } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches any unhandled React render errors within its subtree.
 * Prevents the "White Screen of Death" by rendering a graceful recovery UI
 * with a "Try Again" reset and a "Return to Dashboard" escape hatch.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (process.env.NODE_ENV !== "production") console.error("[ErrorBoundary] Uncaught render error:", error, errorInfo.componentStack);
    trackEvent({
      name: "editor_error",
      props: { errorType: error.name, componentStack: errorInfo.componentStack?.slice(0, 500) },
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen w-full bg-background flex items-center justify-center p-6 relative overflow-hidden">
          {/* Ambient background */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-destructive/10 blur-[120px] rounded-full" />
            <div className="absolute bottom-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-primary/10 blur-[120px] rounded-full" />
          </div>

          <div className="relative z-10 max-w-md w-full text-center">
            {/* Icon */}
            <div className="w-20 h-20 rounded-3xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-destructive" strokeWidth={1.5} />
            </div>

            <h1 className="text-2xl font-black tracking-tight text-foreground mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-muted-foreground mb-4 max-w-xs mx-auto">
              The studio encountered an unexpected error. Your session data is safe.
            </p>

            {/* Non-technical hint — internal detail never exposed to users */}
            <p className="text-[10px] font-mono text-destructive/50 bg-destructive/5 border border-destructive/10 rounded-xl px-4 py-2 mb-8">
              If this keeps happening, please refresh the page or return to the dashboard.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-2xl bg-primary text-white font-black text-sm uppercase tracking-widest hover:bg-primary/90 transition-all shadow-[0_0_20px_hsl(var(--primary)/0.3)]"
              >
                <RefreshCcw className="w-4 h-4" />
                Try Again
              </button>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-2xl bg-secondary text-foreground font-black text-sm uppercase tracking-widest hover:bg-secondary/80 transition-all border border-foreground/5"
              >
                <LayoutGrid className="w-4 h-4" />
                Return to Dashboard
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
