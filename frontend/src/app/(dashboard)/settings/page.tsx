"use client";

import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Shield,
  Bell,
  User,
  Cpu,
  Save,
  Palette,
  Download,
  Sliders,
  Droplets,
  Zap,
  Flame,
  Snowflake,
  Leaf,
  Circle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { cn } from "@/lib/utils";

type Tab = "profile" | "appearance" | "export" | "editor" | "hardware" | "notifications" | "privacy";

const TABS: { id: Tab; icon: LucideIcon; label: string }[] = [
  { id: "profile", icon: User, label: "Profile" },
  { id: "appearance", icon: Palette, label: "Appearance" },
  { id: "export", icon: Download, label: "Export" },
  { id: "editor", icon: Sliders, label: "Editor" },
  { id: "hardware", icon: Cpu, label: "Hardware" },
  { id: "notifications", icon: Bell, label: "Notifications" },
  { id: "privacy", icon: Shield, label: "Privacy" },
];

const THEMES = [
  { id: "dark", name: "Deep Ocean", description: "Bio-luminescent depth", icon: Droplets, color: "#4f46e5" },
  { id: "crystal", name: "Pure Crystal", description: "Bright & clean", icon: Snowflake, color: "#3b82f6" },
  { id: "neon", name: "Neon Flow", description: "Cyberpunk high-vis", icon: Zap, color: "#d946ef" },
  { id: "magma", name: "Obsidian Magma", description: "Volcanic intensity", icon: Flame, color: "#f97316" },
  { id: "aurora", name: "Polar Aurora", description: "Northern lights", icon: Leaf, color: "#10b981" },
  { id: "nano", name: "Nano Black", description: "Minimal & sharp", icon: Circle, color: "#6366f1" },
];

const QUALITY_OPTIONS = ["low", "medium", "high"] as const;
const ASPECT_OPTIONS = ["9:16", "1:1"] as const;

type Quality = typeof QUALITY_OPTIONS[number];
type Aspect = typeof ASPECT_OPTIONS[number];

function useLocalSetting<T>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(defaultValue);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) setValue(JSON.parse(stored) as T);
    } catch {}
  }, [key]);
  const set = (v: T) => {
    setValue(v);
    localStorage.setItem(key, JSON.stringify(v));
  };
  return [value, set];
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const { captionsEnabled, setCaptionsEnabled } = useEditorStore();

  const [activeTab, setActiveTab] = useState<Tab>("profile");

  // Persisted export defaults
  const [defaultQuality, setDefaultQuality] = useLocalSetting<Quality>("qai_quality", "medium");
  const [defaultAspect, setDefaultAspect] = useLocalSetting<Aspect>("qai_aspect", "9:16");

  // Persisted editor prefs
  const [showTelemetry, setShowTelemetry] = useLocalSetting<boolean>("qai_telemetry", true);
  const [autoPlayOnSelect, setAutoPlayOnSelect] = useLocalSetting<boolean>("qai_autoplay", true);

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure your workspace, appearance, and export defaults.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Sidebar Nav */}
        <nav className="space-y-1">
          {TABS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "w-full flex items-center gap-2 h-10 px-4 rounded-lg font-bold uppercase tracking-wider text-[10px] transition-all text-left",
                activeTab === id
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="md:col-span-3 space-y-6">

          {/* ── PROFILE ── */}
          {activeTab === "profile" && (
            <>
              <Card className="border border-white/5">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl font-bold">Profile Information</CardTitle>
                  <CardDescription>Manage your public identity and account details.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center gap-6">
                    <Avatar className="w-20 h-20 border-4 border-primary/10">
                      <AvatarImage src={session?.user?.image || ""} />
                      <AvatarFallback className="text-2xl font-black">
                        {session?.user?.name?.[0] || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                      <h3 className="font-bold text-lg">{session?.user?.name}</h3>
                      <p className="text-sm text-muted-foreground">{session?.user?.email}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Display Name</Label>
                      <Input defaultValue={session?.user?.name || ""} />
                    </div>
                    <div className="space-y-2">
                      <Label>Email Address</Label>
                      <Input defaultValue={session?.user?.email || ""} disabled />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <SaveRow />
            </>
          )}

          {/* ── APPEARANCE ── */}
          {activeTab === "appearance" && (
            <Card className="border border-white/5">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold">Appearance</CardTitle>
                <CardDescription>Choose your color theme. Changes apply instantly.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {THEMES.map((t) => {
                    const Icon = t.icon;
                    const isActive = theme === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          setTheme(t.id);
                          toast.success(`Theme: ${t.name}`);
                        }}
                        className={cn(
                          "flex flex-col items-start gap-3 p-4 rounded-2xl border transition-all text-left",
                          isActive
                            ? "border-primary/50 bg-primary/10 shadow-[0_0_20px_rgba(var(--primary)/0.1)]"
                            : "border-white/5 bg-white/2 hover:bg-white/5 hover:border-white/10",
                        )}
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: t.color, boxShadow: isActive ? `0 0 12px ${t.color}60` : "none" }}
                        >
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-bold">{t.name}</p>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                            {t.description}
                          </p>
                        </div>
                        {isActive && (
                          <div className="ml-auto w-2 h-2 rounded-full bg-primary animate-pulse" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── EXPORT ── */}
          {activeTab === "export" && (
            <>
              <Card className="border border-white/5">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl font-bold">Export Defaults</CardTitle>
                  <CardDescription>
                    These defaults pre-fill the export panel for every new clip.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <Label className="text-xs uppercase tracking-widest font-bold text-muted-foreground">
                      Default Quality
                    </Label>
                    <div className="flex gap-2">
                      {QUALITY_OPTIONS.map((q) => (
                        <button
                          key={q}
                          onClick={() => setDefaultQuality(q)}
                          className={cn(
                            "flex-1 h-10 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all",
                            defaultQuality === q
                              ? "bg-primary/20 border-primary/40 text-primary"
                              : "bg-white/3 border-white/5 text-muted-foreground hover:bg-white/5",
                          )}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-white/5 pt-6">
                    <Label className="text-xs uppercase tracking-widest font-bold text-muted-foreground">
                      Default Aspect Ratio
                    </Label>
                    <div className="flex gap-2">
                      {ASPECT_OPTIONS.map((a) => (
                        <button
                          key={a}
                          onClick={() => setDefaultAspect(a)}
                          className={cn(
                            "flex-1 h-10 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all",
                            defaultAspect === a
                              ? "bg-primary/20 border-primary/40 text-primary"
                              : "bg-white/3 border-white/5 text-muted-foreground hover:bg-white/5",
                          )}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-white/5 pt-6">
                    <div>
                      <Label className="text-base font-bold">Captions by Default</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Burn captions into every export automatically.
                      </p>
                    </div>
                    <Switch
                      checked={captionsEnabled}
                      onCheckedChange={setCaptionsEnabled}
                    />
                  </div>
                </CardContent>
              </Card>
              <SaveRow onSave={() => toast.success("Export defaults saved.")} />
            </>
          )}

          {/* ── EDITOR ── */}
          {activeTab === "editor" && (
            <>
              <Card className="border border-white/5">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl font-bold">Editor Preferences</CardTitle>
                  <CardDescription>Control editor behavior and UI visibility.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ToggleRow
                    label="Show Telemetry Dock"
                    description="Display FPS counter and vision system status in the editor."
                    checked={showTelemetry}
                    onCheckedChange={setShowTelemetry}
                  />
                  <ToggleRow
                    label="Auto-Play on Clip Select"
                    description="Immediately start playback when a clip is selected from the list."
                    checked={autoPlayOnSelect}
                    onCheckedChange={setAutoPlayOnSelect}
                    border
                  />
                </CardContent>
              </Card>
              <SaveRow onSave={() => toast.success("Editor preferences saved.")} />
            </>
          )}

          {/* ── HARDWARE ── */}
          {activeTab === "hardware" && (
            <>
              <Card className="border border-white/5">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl font-bold text-primary">
                    Local Analysis Preferences
                  </CardTitle>
                  <CardDescription>
                    Configure how AI models run in your browser.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ToggleRow
                    label="Use Tiny Whisper Model"
                    description="Faster processing but lower accuracy. Best for devices with low RAM."
                    checked={true}
                  />
                  <ToggleRow
                    label="Enable Multithreading"
                    description="Uses all available CPU cores via SharedArrayBuffer for faster encoding."
                    checked={true}
                    border
                  />
                </CardContent>
              </Card>
              <SaveRow />
            </>
          )}

          {/* ── NOTIFICATIONS ── */}
          {activeTab === "notifications" && (
            <>
              <Card className="border border-white/5">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl font-bold">Notifications</CardTitle>
                  <CardDescription>Control which events trigger in-app toasts.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ToggleRow label="Export Complete" description="Show a toast when an export finishes downloading." checked={true} />
                  <ToggleRow label="Analysis Ready" description="Notify when AI clip suggestions are ready." checked={true} border />
                  <ToggleRow label="Processing Errors" description="Always show errors regardless of this setting." checked={true} border />
                </CardContent>
              </Card>
              <SaveRow />
            </>
          )}

          {/* ── PRIVACY ── */}
          {activeTab === "privacy" && (
            <Card className="border border-white/5">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold">Privacy</CardTitle>
                <CardDescription>
                  All video processing runs locally in your browser. No video data leaves your device.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                  <p className="text-sm font-bold text-primary mb-1">100% Local Processing</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    FFmpeg, Whisper, and face tracking all run as Web Workers inside your browser.
                    Your videos never leave your machine unless you explicitly export and share them.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-white/3 border border-white/5">
                  <p className="text-sm font-bold mb-1">Data Stored</p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                    <li>Session token (next-auth, encrypted cookie)</li>
                    <li>Editor preferences (localStorage, your device only)</li>
                    <li>Export history metadata (MongoDB, no video content)</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  border,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange?: (v: boolean) => void;
  border?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between", border && "border-t border-white/5 pt-6")}>
      <div className="space-y-0.5 pr-4">
        <Label className="text-base font-bold">{label}</Label>
        <p className="text-xs text-muted-foreground max-w-xs">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function SaveRow({ onSave }: { onSave?: () => void }) {
  return (
    <div className="flex justify-end gap-3">
      <Button variant="outline" className="h-11 px-8 rounded-xl font-bold">
        Cancel
      </Button>
      <Button
        className="h-11 px-8 rounded-xl font-bold gap-2"
        onClick={onSave ?? (() => toast.success("Settings saved!"))}
      >
        <Save className="w-4 h-4" /> Save Changes
      </Button>
    </div>
  );
}
