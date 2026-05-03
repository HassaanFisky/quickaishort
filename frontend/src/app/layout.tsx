import type { Metadata } from "next";
import { Inter as Geist, JetBrains_Mono as Geist_Mono, Montserrat } from "next/font/google";
import "./globals.css";

import { AppProviders } from "@/components/shared/AppProviders";
import { CommandPalette } from "@/components/layout/CommandPalette";

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
  title: "QuickAI Shorts - Free-for-Life AI Video Shorts Generator",
  description:
    "Create viral YouTube Shorts instantly from any video using client-side AI analysis and processing.",
  icons: {
    icon: "/qs-logo.png",
    shortcut: "/qs-logo.png",
    apple: "/qs-logo.png",
  },
  openGraph: {
    title: "QuickAI Shorts",
    description: "Create viral YouTube Shorts instantly from any video.",
    images: [
      {
        url: "/qs-logo.png",
        width: 1024,
        height: 1024,
        alt: "QuickAI Shorts Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "QuickAI Shorts",
    description: "Create viral YouTube Shorts instantly from any video.",
    images: ["/qs-logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${montserrat.variable} antialiased`}
      >
        <div className="living-water-bg" />
        <AppProviders>
          {children}
          <CommandPalette />
        </AppProviders>
      </body>
    </html>
  );
}
