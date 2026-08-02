"use client";

import { Component, ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCcw, LayoutGrid } from "lucide-react";
import * as Sentry from "@sentry/nextjs";
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
    Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo.componentStack } },
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

            <h1 className="text-xl font-semibold tracking-tight text-foreground mb-2">
              This screen hit an error
            </h1>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto leading-relaxed">
              The editor UI crashed, but your timeline and uploads are not deleted. Refresh or return home to continue.
            </p>

            <p className="text-[11px] text-muted-foreground/80 mb-8">
              If it happens again, note what you clicked last and retry from the home workspace.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
              >
                <RefreshCcw className="w-4 h-4" />
                Try again
              </button>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-xl border border-border text-foreground font-medium text-sm hover:bg-muted transition-colors"
              >
                <LayoutGrid className="w-4 h-4" />
                Back to home
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
