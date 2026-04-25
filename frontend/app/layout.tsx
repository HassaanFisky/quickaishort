import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "QuickAI Shorts — Free YouTube Shorts Generator",
  description:
    "Turn YouTube videos into viral shorts in seconds. Browser-native editor with client-side rendering. No upload required.",
  keywords: [
    "YouTube Shorts",
    "video editor",
    "AI shorts",
    "browser video editor",
    "FFmpeg",
  ],
  openGraph: {
    title: "QuickAI Shorts — Free YouTube Shorts Generator",
    description:
      "Turn YouTube videos into viral shorts in seconds. Browser-native editor.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body
        className="font-sans antialiased bg-black text-white"
        suppressHydrationWarning
      >
        <Providers>
          {children}
          <Toaster position="bottom-right" theme="dark" />
        </Providers>
      </body>
    </html>
  );
}
