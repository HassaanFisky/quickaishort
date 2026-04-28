import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id: string;
    settings?: UserSettings;
  }

  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      settings?: UserSettings;
    };
  }

  interface UserSettings {
    theme: "light" | "dark" | "system" | "crystal" | "neon" | "magma" | "nano";
    defaultAspectRatio: "9:16" | "1:1";
    defaultQuality: "low" | "medium" | "high";
    captionPreset: string;
    whisperModel: "tiny" | "base" | "small";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    settings?: any;
  }
}
