/**
 * ModePack OS — Platform Specifications & Defaults
 * Defines aspect ratios, safe zones, caption presets, and LUFS targets
 * for standard video distribution formats.
 */

export type ModePackId =
  | "shorts_reels"
  | "youtube_long"
  | "podcast_clip"
  | "ad_ugc"
  | "tutorial";

export type SupportedAspectRatio = "9:16" | "16:9" | "1:1" | "4:5";

export interface ModePackSafeZone {
  topPct: number;    // % margin from top edge
  bottomPct: number; // % margin from bottom edge
  leftPct: number;   // % margin from left edge
  rightPct: number;  // % margin from right edge
  label: string;
  description: string;
}

export interface ModePackCaptionPreset {
  styleName: string;
  fontSize: number;
  color: string;
  background: string;
  position: "top" | "middle" | "bottom";
  bold: boolean;
}

export interface ModePack {
  id: ModePackId;
  name: string;
  shortLabel: string;
  description: string;
  aspectRatio: SupportedAspectRatio;
  safeZone: ModePackSafeZone;
  captionPreset: ModePackCaptionPreset;
  lufsTarget: number; // e.g. -14 LUFS
  maxDurationSec: number;
  iconName: "Smartphone" | "Tv" | "Mic" | "Megaphone" | "GraduationCap";
}

export const MODE_PACKS: Record<ModePackId, ModePack> = {
  shorts_reels: {
    id: "shorts_reels",
    name: "Shorts & Reels",
    shortLabel: "Shorts",
    description: "TikTok, IG Reels, and YouTube Shorts (9:16) with UI overlay safe zones",
    aspectRatio: "9:16",
    safeZone: {
      topPct: 12,
      bottomPct: 22,
      leftPct: 6,
      rightPct: 18,
      label: "TikTok / Reels Safe Zone",
      description: "Protects against right-side action buttons and bottom audio tags",
    },
    captionPreset: {
      styleName: "Viral High-Contrast",
      fontSize: 26,
      color: "#FFDD00",
      background: "rgba(0, 0, 0, 0.85)",
      position: "bottom",
      bold: true,
    },
    lufsTarget: -14,
    maxDurationSec: 60,
    iconName: "Smartphone",
  },
  youtube_long: {
    id: "youtube_long",
    name: "YouTube Longform",
    shortLabel: "YouTube",
    description: "Standard 16:9 widescreen video with action & title safe guides",
    aspectRatio: "16:9",
    safeZone: {
      topPct: 8,
      bottomPct: 10,
      leftPct: 8,
      rightPct: 8,
      label: "16:9 Action & Title Safe",
      description: "Standard broadcast 90% action-safe guide",
    },
    captionPreset: {
      styleName: "Subtle Subtitle",
      fontSize: 20,
      color: "#FFFFFF",
      background: "rgba(0, 0, 0, 0.65)",
      position: "bottom",
      bold: false,
    },
    lufsTarget: -14,
    maxDurationSec: 900,
    iconName: "Tv",
  },
  podcast_clip: {
    id: "podcast_clip",
    name: "Podcast Clip",
    shortLabel: "Podcast",
    description: "Speech-first clip with waveform safe margins and AES broadcast LUFS",
    aspectRatio: "9:16",
    safeZone: {
      topPct: 14,
      bottomPct: 28,
      leftPct: 10,
      rightPct: 16,
      label: "Podcast Audio Safe",
      description: "Leaves bottom area clear for visualizers and audiograms",
    },
    captionPreset: {
      styleName: "Karaoke Dynamic",
      fontSize: 24,
      color: "#00F0FF",
      background: "rgba(15, 23, 42, 0.9)",
      position: "middle",
      bold: true,
    },
    lufsTarget: -16,
    maxDurationSec: 180,
    iconName: "Mic",
  },
  ad_ugc: {
    id: "ad_ugc",
    name: "UGC Ad",
    shortLabel: "Ad / UGC",
    description: "Direct-response ad layout avoiding platform CTA overlays",
    aspectRatio: "9:16",
    safeZone: {
      topPct: 15,
      bottomPct: 26,
      leftPct: 8,
      rightPct: 20,
      label: "Ad Sponsored & CTA Safe",
      description: "Clears swipe-up / shop buttons and sponsored headers",
    },
    captionPreset: {
      styleName: "High-Energy Punch",
      fontSize: 28,
      color: "#FFFFFF",
      background: "#7C3AED",
      position: "bottom",
      bold: true,
    },
    lufsTarget: -14,
    maxDurationSec: 60,
    iconName: "Megaphone",
  },
  tutorial: {
    id: "tutorial",
    name: "Tutorial / Walkthrough",
    shortLabel: "Tutorial",
    description: "Educational screencast layout with crisp lower-third safe zone",
    aspectRatio: "16:9",
    safeZone: {
      topPct: 6,
      bottomPct: 12,
      leftPct: 6,
      rightPct: 6,
      label: "Code & UI Safe",
      description: "Preserves readability for code, terminal, and UI walkthroughs",
    },
    captionPreset: {
      styleName: "Crisp Lower-Third",
      fontSize: 18,
      color: "#F8FAFC",
      background: "rgba(30, 41, 59, 0.85)",
      position: "bottom",
      bold: true,
    },
    lufsTarget: -15,
    maxDurationSec: 300,
    iconName: "GraduationCap",
  },
};

export const DEFAULT_MODE_PACK_ID: ModePackId = "shorts_reels";

export function getModePack(id: ModePackId | string): ModePack {
  if (id in MODE_PACKS) {
    return MODE_PACKS[id as ModePackId];
  }
  return MODE_PACKS[DEFAULT_MODE_PACK_ID];
}
