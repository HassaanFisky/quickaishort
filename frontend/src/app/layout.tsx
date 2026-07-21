import type { Metadata } from "next";
import { Inter as Geist, JetBrains_Mono as Geist_Mono, Montserrat } from "next/font/google";
import "./globals.css";
import { cookies } from "next/headers";

import { AppProviders } from "@/components/shared/AppProviders";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { PaddleProvider } from "@/components/shared/PaddleProvider";
import { SkipLink } from "@/components/shared/SkipLink";
import { BottomTabBar } from "@/components/layout/BottomTabBar";
import { RouteFade } from "@/components/shared/RouteFade";
import { OfflineNotice } from "@/components/shared/OfflineNotice";
import { CookieConsent } from "@/components/shared/CookieConsent";
import { ServiceWorkerRegistrar } from "@/components/shared/ServiceWorkerRegistrar";
import { RouteAnalytics } from "@/lib/analytics";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["900"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://quickaishort.online"),
  title: "QuickAI Short | Conversational AI Video Editing",
  description:
    "Turn long-form video into finished shorts with conversational AI. Paste a URL or upload, chat your edits, preview, and export with Gemini.",
  keywords: ["AI video editor", "conversational video editing", "youtube to shorts", "gemini", "video export", "content creator tools"],
  authors: [{ name: "QuickAI Team" }],
  manifest: "/manifest.json",
  icons: {
    icon: "/qs-logo.png",
    shortcut: "/qs-logo.png",
    apple: "/qs-logo.png",
  },
  openGraph: {
    type: "website",
    url: "https://quickaishort.online",
    title: "QuickAI Short | Conversational AI Editor",
    description: "Chat-driven video editing — ingest, preview, and export.",
    siteName: "QuickAI Short",
    images: [
      {
        url: "/qs-logo.png",
        width: 1024,
        height: 1024,
        alt: "QuickAI Short Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "QuickAI Short | AI Video Editor",
    description: "Conversational AI editing for long-form to short-form video.",
    images: ["/qs-logo.png"],
    creator: "@quickaishort",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = cookies();
  const locale = cookieStore.get("NEXT_LOCALE")?.value || "en";

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${montserrat.variable} antialiased`}
      >
        <SkipLink />
        <div className="living-water-bg" />
        <AppProviders>
          <RouteAnalytics />
          <PaddleProvider />
          <OfflineNotice />
          <main id="main" tabIndex={-1}>
            <RouteFade>{children}</RouteFade>
          </main>
          <BottomTabBar />
          <CommandPalette />
          <CookieConsent />
          <ServiceWorkerRegistrar />
        </AppProviders>
      </body>
    </html>
  );
}

