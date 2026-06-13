"use client";

import { ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { MotionConfig } from "framer-motion";
import { ThemeProvider } from "@/components/shared/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import { PusherProvider } from "@/components/providers/PusherProvider";
import SplashScreen from "@/components/shared/SplashScreen";
import PageTransition from "@/components/shared/PageTransition";
import { SessionExpiryModal } from "@/components/shared/SessionExpiryModal";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <MotionConfig reducedMotion="user">
      <SessionProvider>
        <QueryClientProvider client={queryClient}>
          <PusherProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="dark"
              enableSystem
              disableTransitionOnChange
              themes={["dark", "oled", "light"]}
            >
              <SplashScreen />
              <ErrorBoundary>
                <PageTransition>{children}</PageTransition>
              </ErrorBoundary>
              <Toaster position="top-center" richColors />
              <SessionExpiryModal />
            </ThemeProvider>
          </PusherProvider>
        </QueryClientProvider>
      </SessionProvider>
    </MotionConfig>
  );
}
