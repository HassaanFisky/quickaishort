export const PROJECT_TEMPLATES = [
  { id: "youtube-short",    label: "YouTube Short",    aspectRatio: "9:16" as const, maxDuration: 60  },
  { id: "tiktok",           label: "TikTok",           aspectRatio: "9:16" as const, maxDuration: 180 },
  { id: "instagram-reel",   label: "Instagram Reel",   aspectRatio: "9:16" as const, maxDuration: 90  },
  { id: "youtube-video",    label: "YouTube Video",    aspectRatio: "16:9" as const, maxDuration: 600 },
  { id: "square-post",      label: "Square Post",      aspectRatio: "1:1"  as const, maxDuration: 60  },
] as const;

export type ProjectTemplateId = typeof PROJECT_TEMPLATES[number]["id"];
export type ProjectTemplate   = typeof PROJECT_TEMPLATES[number];
