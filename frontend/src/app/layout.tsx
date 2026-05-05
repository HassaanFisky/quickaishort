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
  metadataBase: new URL("https://quickaishort.online"),
  title: "QuickAI Shorts | The World's Most Powerful AI Short-Form Studio",
  description:
    "Transform long-form videos into viral shorts instantly. Powered by Gemini 2.5 Flash and multi-agent AI for 100% stable extraction, automatic captions, and viral scoring.",
  keywords: ["AI video editor", "youtube shorts generator", "viral clips", "gemini 2.5 flash", "video automation", "content creator tools"],
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
    title: "QuickAI Shorts | AI Video Studio",
    description: "The elite studio for creating viral shorts with multi-agent AI.",
    siteName: "QuickAI Shorts",
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
    title: "QuickAI Shorts | Viral AI Clips",
    description: "Transform long-form videos into viral shorts instantly with AI.",
    images: ["/qs-logo.png"],
    creator: "@quickaishort",
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
