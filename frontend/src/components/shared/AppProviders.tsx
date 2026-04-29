"use client";

import { ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/shared/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import SplashScreen from "@/components/shared/SplashScreen";
import PageTransition from "@/components/shared/PageTransition";

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
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
          themes={["dark", "light", "crystal", "neon", "magma", "aurora", "nano"]}
        >
          <SplashScreen />
          <PageTransition>{children}</PageTransition>
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
