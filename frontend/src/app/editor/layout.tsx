import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Editor — QuickAI Shorts",
  description: "AI-powered browser-native video editor. Paste a YouTube URL, edit with voice or text, export viral shorts.",
};

export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
