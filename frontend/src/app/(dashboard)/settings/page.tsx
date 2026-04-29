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
import { Badge } from "@/components/ui/badge";
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
  Circle,
  Sparkles,
  Sun,
  Waves,
  Keyboard,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

type Tab = "profile" | "appearance" | "export" | "editor" | "shortcuts" | "notifications" | "privacy";

const TABS: { id: Tab; icon: LucideIcon; label: string }[] = [
  { id: "profile", icon: User, label: "Profile" },
  { id: "appearance", icon: Palette, label: "Appearance" },
  { id: "export", icon: Download, label: "Export" },
  { id: "editor", icon: Sliders, label: "Editor" },
  { id: "shortcuts", icon: Keyboard, label: "Shortcuts" },
  { id: "notifications", icon: Bell, label: "Notifications" },
  { id: "privacy", icon: Shield, label: "Privacy" },
];

const THEMES = [
  { id: "dark", name: "Dark", description: "Default", icon: Droplets, color: "#a855f7", bg: "#08080a" },
  { id: "light", name: "Light", description: "Clean & bright", icon: Sun, color: "#a855f7", bg: "#f8f8fc" },
  { id: "neon", name: "Neon", description: "Electric green", icon: Zap, color: "#39ff14", bg: "#030305" },
  { id: "crystal", name: "Crystal", description: "Sky blue", icon: Snowflake, color: "#38bdf8", bg: "#f0f9ff" },
  { id: "magma", name: "Magma", description: "Orange-red", icon: Flame, color: "#ff4500", bg: "#0a0604" },
  { id: "aurora", name: "Aurora", description: "Teal-green", icon: Waves, color: "#06d6a0", bg: "#061418" },
];

const SHORTCUTS = [
  { action: "Play / Pause", keys: "Space" },
  { action: "Skip Forward 10s", keys: "→" },
  { action: "Skip Backward 10s", keys: "←" },
  { action: "Run Pre-Flight", keys: "Shift + P" },
  { action: "Export", keys: "Ctrl + E" },
  { action: "New Project", keys: "Ctrl + N" },
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

  const [defaultQuality, setDefaultQuality] = useLocalSetting<Quality>("qai_quality", "medium");
  const [defaultAspect, setDefaultAspect] = useLocalSetting<Aspect>("qai_aspect", "9:16");
  const [showTelemetry, setShowTelemetry] = useLocalSetting<boolean>("qai_telemetry", true);
  const [autoPlayOnSelect, setAutoPlayOnSelect] = useLocalSetting<boolean>("qai_autoplay", true);

  return (
    <div className="container mx-auto px-6 py-12 max-w-6xl space-y-12">
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="space-y-4"
      >
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
            <Sliders className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter premium-gradient-text">
            Studio Settings
          </h1>
        </div>
        <p className="text-muted-foreground text-lg font-medium opacity-80 max-w-2xl leading-relaxed">
          Fine-tune your professional AI environment. These global preferences define your production workflow.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
        {/* Sidebar Nav */}
        <nav className="md:col-span-3 space-y-2">
          {TABS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "w-full flex items-center gap-3 h-12 px-5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all text-left group",
                activeTab === id
                  ? "bg-primary/10 text-primary border border-primary/20 shadow-lg shadow-primary/5"
                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground border border-transparent",
              )}
            >
              <Icon className={cn("w-4 h-4 transition-transform group-hover:scale-110", activeTab === id && "text-primary")} />
              {label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="md:col-span-9">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              {/* ── PROFILE ── */}
              {activeTab === "profile" && (
                <>
                  <Card className="depth-card glass-surface rounded-[2.5rem] border-foreground/5 p-4">
                    <CardHeader className="pb-8">
                      <CardTitle className="text-2xl font-black tracking-tight">Identity & Account</CardTitle>
                      <CardDescription className="text-base font-medium">Manage your professional profile and credentials.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-10">
                      <div className="flex items-center gap-8 p-6 rounded-3xl bg-foreground/[0.03] border border-foreground/5">
                        <div className="relative group">
                          <Avatar className="w-24 h-24 border-4 border-primary/10 transition-transform group-hover:scale-105 duration-500">
                            <AvatarImage src={session?.user?.image || ""} />
                            <AvatarFallback className="text-3xl font-black bg-primary/20 text-primary">
                              {session?.user?.name?.[0] || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="absolute inset-0 rounded-full border border-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="space-y-1">
                          <h3 className="font-black text-2xl tracking-tight">{session?.user?.name || "Member"}</h3>
                          <p className="text-sm font-bold text-primary uppercase tracking-widest opacity-80">{session?.user?.email}</p>
                          <Badge variant="outline" className="mt-2 bg-primary/10 border-primary/20 text-primary text-[9px] font-black uppercase tracking-widest">Elite Member</Badge>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-3">
                          <Label className="text-xs font-black uppercase tracking-widest opacity-60">Display Name</Label>
                          <Input 
                            defaultValue={session?.user?.name || ""} 
                            className="h-12 rounded-xl bg-foreground/[0.03] border-foreground/5 focus:border-primary/50 transition-all font-bold"
                          />
                        </div>
                        <div className="space-y-3">
                          <Label className="text-xs font-black uppercase tracking-widest opacity-60">System ID</Label>
                          <Input 
                            defaultValue={session?.user?.email || ""} 
                            disabled 
                            className="h-12 rounded-xl bg-foreground/[0.01] border-foreground/5 font-mono text-xs opacity-50"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <SaveRow />
                </>
              )}

              {/* ── APPEARANCE ── */}
              {activeTab === "appearance" && (
                <Card className="depth-card glass-surface rounded-[2.5rem] border-foreground/5 p-4">
                  <CardHeader className="pb-8">
                    <CardTitle className="text-2xl font-black tracking-tight text-foreground/90">
                      Theme
                    </CardTitle>
                    <CardDescription className="text-base font-medium">
                      Click any swatch — applied instantly, persists across sessions.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-6 max-w-md">
                      {THEMES.map((t) => {
                        const isActive = theme === t.id;
                        return (
                          <button
                            key={t.id}
                            onClick={() => setTheme(t.id)}
                            className="flex flex-col items-center gap-2 group focus-visible:outline-none"
                            aria-label={`Switch to ${t.name} theme`}
                          >
                            <div
                              className={cn(
                                "relative h-16 w-16 rounded-xl overflow-hidden border-2 transition-all duration-150",
                                isActive
                                  ? "border-primary scale-105 shadow-[0_0_0_2px_hsl(var(--background)),0_0_0_4px_hsl(var(--primary))]"
                                  : "border-border group-hover:border-foreground/20",
                              )}
                              style={{ background: t.bg }}
                            >
                              <div
                                className="absolute bottom-2 right-2 h-4 w-4 rounded-full"
                                style={{ background: t.color }}
                              />
                              <div
                                className="absolute top-2 left-2 h-1.5 w-6 rounded-full opacity-30"
                                style={{ background: t.color }}
                              />
                            </div>
                            <span
                              className={cn(
                                "text-xs font-semibold transition-colors",
                                isActive
                                  ? "text-foreground"
                                  : "text-muted-foreground group-hover:text-foreground",
                              )}
                            >
                              {t.name}
                            </span>
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
                  <Card className="depth-card glass-surface rounded-[2.5rem] border-foreground/5 p-4">
                    <CardHeader className="pb-8">
                      <CardTitle className="text-2xl font-black tracking-tight">Export Pipeline</CardTitle>
                      <CardDescription className="text-base font-medium">Configure global default output parameters.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-10">
                      <div className="space-y-4">
                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-70">
                          Target Rendering Quality
                        </Label>
                        <div className="flex gap-3">
                          {QUALITY_OPTIONS.map((q) => (
                            <button
                              key={q}
                              onClick={() => setDefaultQuality(q)}
                              className={cn(
                                "flex-1 h-14 rounded-2xl text-[11px] font-black uppercase tracking-widest border transition-all duration-300",
                                defaultQuality === q
                                  ? "bg-primary/20 border-primary/40 text-primary shadow-lg shadow-primary/5"
                                  : "bg-foreground/[0.03] border-foreground/5 text-muted-foreground hover:bg-foreground/[0.06]",
                              )}
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4 border-t border-foreground/5 pt-10">
                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-70">
                          Default Format Strategy
                        </Label>
                        <div className="flex gap-3">
                          {ASPECT_OPTIONS.map((a) => (
                            <button
                              key={a}
                              onClick={() => setDefaultAspect(a)}
                              className={cn(
                                "flex-1 h-14 rounded-2xl text-[11px] font-black uppercase tracking-widest border transition-all duration-300",
                                defaultAspect === a
                                  ? "bg-primary/20 border-primary/40 text-primary shadow-lg shadow-primary/5"
                                  : "bg-foreground/[0.03] border-foreground/5 text-muted-foreground hover:bg-foreground/[0.06]",
                              )}
                            >
                              {a} Ratio
                            </button>
                          ))}
                        </div>
                      </div>

                      <ToggleRow
                        label="Autonomous Captions"
                        description="Automatically burn high-precision AI captions into every export."
                        checked={captionsEnabled}
                        onCheckedChange={setCaptionsEnabled}
                        border
                      />
                    </CardContent>
                  </Card>
                  <SaveRow onSave={() => toast.success("Export defaults updated.")} />
                </>
              )}

              {/* ── EDITOR ── */}
              {activeTab === "editor" && (
                <>
                  <Card className="depth-card glass-surface rounded-[2.5rem] border-foreground/5 p-4">
                    <CardHeader className="pb-8">
                      <CardTitle className="text-2xl font-black tracking-tight">Studio Experience</CardTitle>
                      <CardDescription className="text-base font-medium">Control visual focus and automated studio behaviors.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-8">
                      <ToggleRow
                        label="Studio Telemetry"
                        description="Display real-time performance metrics and AI vision status."
                        checked={showTelemetry}
                        onCheckedChange={setShowTelemetry}
                      />
                      <ToggleRow
                        label="Predictive Playback"
                        description="Instantly initialize preview when an AI-suggested clip is focused."
                        checked={autoPlayOnSelect}
                        onCheckedChange={setAutoPlayOnSelect}
                        border
                      />
                    </CardContent>
                  </Card>
                  <SaveRow onSave={() => toast.success("Studio preferences synchronized.")} />
                </>
              )}

              {/* ── SHORTCUTS ── */}
              {activeTab === "shortcuts" && (
                <Card className="depth-card glass-surface rounded-[2.5rem] border-foreground/5 p-4">
                  <CardHeader className="pb-8">
                    <CardTitle className="text-2xl font-black tracking-tight">
                      Keyboard Shortcuts
                    </CardTitle>
                    <CardDescription className="text-base font-medium">
                      Read-only reference. Bindings are fixed in this build.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-2xl border border-border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-secondary/40 text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                            <th className="text-left px-5 py-3 font-semibold">Action</th>
                            <th className="text-right px-5 py-3 font-semibold">Shortcut</th>
                          </tr>
                        </thead>
                        <tbody>
                          {SHORTCUTS.map((s, i) => (
                            <tr
                              key={s.action}
                              className={cn(
                                "border-t border-border",
                                i % 2 === 1 && "bg-secondary/20",
                              )}
                            >
                              <td className="px-5 py-3 font-medium">{s.action}</td>
                              <td className="px-5 py-3 text-right">
                                <kbd className="inline-flex items-center rounded-md border border-border bg-background px-2 py-1 text-[11px] font-mono">
                                  {s.keys}
                                </kbd>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── NOTIFICATIONS ── */}
              {activeTab === "notifications" && (
                <>
                  <Card className="depth-card glass-surface rounded-[2.5rem] border-foreground/5 p-4">
                    <CardHeader className="pb-8">
                      <CardTitle className="text-2xl font-black tracking-tight text-foreground/90">Alert System</CardTitle>
                      <CardDescription className="text-base font-medium">Manage production event notifications and status updates.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-8">
                      <ToggleRow label="Session Completion" description="Notify when high-fidelity renders are ready for download." checked={true} />
                      <ToggleRow label="Analysis Intelligence" description="Alert when viral mapping and face detection is complete." checked={true} border />
                      <ToggleRow label="Critical Overlays" description="Always display essential system status and hardware alerts." checked={true} border />
                    </CardContent>
                  </Card>
                  <SaveRow />
                </>
              )}

              {/* ── PRIVACY ── */}
              {activeTab === "privacy" && (
                <Card className="depth-card glass-surface rounded-[2.5rem] border-foreground/5 p-4">
                  <CardHeader className="pb-8">
                    <CardTitle className="text-2xl font-black tracking-tight text-foreground/90">Encryption & Privacy</CardTitle>
                    <CardDescription className="text-base font-medium">
                      Elite privacy by design. All core processing is sandboxed on your device.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="p-8 rounded-[2rem] bg-primary/5 border border-primary/10 space-y-4">
                      <div className="flex items-center gap-3">
                         <Shield className="w-6 h-6 text-primary" />
                         <p className="text-xl font-black tracking-tight text-primary">Zero-Trust Processing</p>
                      </div>
                      <p className="text-sm font-medium text-muted-foreground leading-relaxed opacity-90">
                        Our hybrid engine runs FFmpeg, Whisper, and Vision models as local Web Workers.
                        Your raw source media never touches our servers.
                      </p>
                    </div>
                    <div className="p-8 rounded-[2rem] bg-foreground/[0.02] border border-foreground/5 space-y-4">
                      <p className="text-lg font-black tracking-tight">Active Data Map</p>
                      <ul className="text-sm font-medium text-muted-foreground space-y-3">
                        <li className="flex items-center gap-3">
                           <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                           Session token (sandboxed & encrypted)
                        </li>
                        <li className="flex items-center gap-3">
                           <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                           Workspace preferences (local persistence only)
                        </li>
                        <li className="flex items-center gap-3">
                           <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                           Metadata logs (archived in cloud, no media content)
                        </li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          </AnimatePresence>
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
    <div className={cn("flex items-center justify-between group", border && "border-t border-foreground/5 pt-8")}>
      <div className="space-y-1 pr-6">
        <Label className="text-lg font-black tracking-tight text-foreground/90 group-hover:text-primary transition-colors">{label}</Label>
        <p className="text-sm font-medium text-muted-foreground max-w-md opacity-80">{description}</p>
      </div>
      <Switch 
        checked={checked} 
        onCheckedChange={onCheckedChange}
        className="data-[state=checked]:bg-primary"
      />
    </div>
  );
}

function SaveRow({ onSave }: { onSave?: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-end gap-4 mt-8"
    >
      <Button variant="outline" className="h-14 px-10 rounded-2xl font-black uppercase tracking-widest text-[10px] border-foreground/10 hover:bg-foreground/5">
        Reset
      </Button>
      <Button
        className="h-14 px-10 rounded-2xl font-black uppercase tracking-widest text-[10px] gap-3 shadow-xl shadow-primary/20"
        onClick={onSave ?? (() => toast.success("Preferences synchronized!"))}
      >
        <Save className="w-4 h-4" /> Synchronize Changes
      </Button>
    </motion.div>
  );
}
