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
  Users,
  Save,
  Palette,
  Download,
  Sliders,
  Droplets,
  Zap,
  Sun,
  Keyboard,
  Check,
  RotateCcw,
  Lock,
  Server,
  Trash2,
  FileText,
  ExternalLink,
  CreditCard,
  Sparkles,
  Mail,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useTranslations } from "@/lib/i18n";
import { useEditorStore } from "@/stores/editorStore";
import {
  useShortcutsStore,
  SHORTCUT_ACTIONS,
  eventToCombo,
  comboToChips,
  DEFAULTS,
  type ShortcutId,
} from "@/stores/shortcutsStore";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { getStats } from "@/lib/api";
import { EMPTY_STATS, type UserStats } from "@/types/stats";

type Tab = "profile" | "billing" | "appearance" | "export" | "editor" | "shortcuts" | "notifications" | "privacy" | "referral";

const TABS: { id: Tab; icon: LucideIcon; label: string }[] = [
  { id: "profile", icon: User, label: "Profile" },
  { id: "billing", icon: CreditCard, label: "Billing" },
  { id: "appearance", icon: Palette, label: "Appearance" },
  { id: "export", icon: Download, label: "Export" },
  { id: "editor", icon: Sliders, label: "Editor" },
  { id: "shortcuts", icon: Keyboard, label: "Shortcuts" },
  { id: "notifications", icon: Bell, label: "Notifications" },
  { id: "privacy", icon: Shield, label: "Privacy" },
  { id: "referral", icon: Users, label: "Referrals" },
];

const THEMES = [
  { id: "dark",  name: "Studio Dark",   description: "Elegant graphite",  icon: Droplets, color: "#b984ff", bg: "#131316" },
  { id: "oled",  name: "OLED Pitch",    description: "Pure-black focus",   icon: Zap,      color: "#c084fc", bg: "#000000" },
  { id: "light", name: "Creator Light", description: "Pristine & bright",  icon: Sun,      color: "#7c3aed", bg: "#fdfdff" },
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

  const [displayName, setDisplayName] = useState(session?.user?.name ?? "");
  // Sync display name from session on first load
  useEffect(() => {
    if (session?.user?.name) setDisplayName(session.user.name);
  }, [session?.user?.name]);

  const [defaultQuality, setDefaultQuality] = useLocalSetting<Quality>("qai_quality", "medium");
  const [defaultAspect, setDefaultAspect] = useLocalSetting<Aspect>("qai_aspect", "9:16");
  const [showTelemetry, setShowTelemetry] = useLocalSetting<boolean>("qai_telemetry", true);
  const [autoPlayOnSelect, setAutoPlayOnSelect] = useLocalSetting<boolean>("qai_autoplay", true);
  const [notifyCompletion, setNotifyCompletion] = useLocalSetting<boolean>("qai_notify_completion", true);
  const [notifyAnalysis, setNotifyAnalysis] = useLocalSetting<boolean>("qai_notify_analysis", true);
  const [notifyCritical, setNotifyCritical] = useLocalSetting<boolean>("qai_notify_critical", true);

  const [billingStats, setBillingStats] = useState<UserStats>(EMPTY_STATS);
  const [billingLoading, setBillingLoading] = useState(true);
  const userId = (session?.user as { id?: string } | undefined)?.id ?? session?.user?.email ?? "";
  useEffect(() => {
    if (activeTab !== "billing" || !userId) return;
    let cancelled = false;
    setBillingLoading(true);
    getStats(userId)
      .then((s) => { if (!cancelled) setBillingStats({ ...EMPTY_STATS, ...s, user_id: userId }); })
      .catch(() => { if (!cancelled) setBillingStats({ ...EMPTY_STATS, user_id: userId }); })
      .finally(() => { if (!cancelled) setBillingLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, userId]);

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
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="h-12 rounded-xl bg-foreground/[0.03] border-foreground/5 focus:border-primary/50 transition-all font-bold"
                          />
                        </div>
                        <div className="space-y-3">
                          <Label className="text-xs font-black uppercase tracking-widest opacity-60">System ID</Label>
                          <Input
                            value={session?.user?.email || ""}
                            readOnly
                            className="h-12 rounded-xl bg-foreground/[0.01] border-foreground/5 font-mono text-xs opacity-50"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <SaveRow
                    onSave={() => toast.success("Profile updated.")}
                    onReset={() => setDisplayName(session?.user?.name ?? "")}
                  />
                </>
              )}

              {/* ── BILLING ── */}
              {activeTab === "billing" && (
                <Card className="depth-card glass-surface rounded-[2.5rem] border-foreground/5 p-4">
                  <CardHeader className="pb-8">
                    <CardTitle className="text-2xl font-black tracking-tight">Billing</CardTitle>
                    <CardDescription className="text-base font-medium">Your plan, credits, and subscription status.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-8">
                    <div className="flex items-center gap-8 p-6 rounded-3xl bg-foreground/[0.03] border border-foreground/5">
                      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                        <Sparkles className="w-7 h-7 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-black text-2xl tracking-tight">
                            {billingLoading ? "—" : billingStats.is_pro ? "Pro" : "Free"}
                          </h3>
                          <Badge variant="outline" className={cn(
                            "text-[9px] font-black uppercase tracking-widest",
                            billingStats.is_pro ? "bg-primary/10 border-primary/20 text-primary" : "bg-foreground/5 border-foreground/10 text-muted-foreground",
                          )}>
                            {billingStats.is_pro ? "Active" : "No subscription"}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium text-muted-foreground">
                          {billingStats.is_pro ? "$29/month · billed via Paddle" : "Upgrade for Elite Viral Intelligence and unlimited Pre-Flight runs."}
                        </p>
                      </div>
                      {!billingStats.is_pro && (
                        <Button className="h-11 px-6 rounded-2xl font-black uppercase tracking-widest text-[10px] shrink-0" asChild>
                          <Link href="/pricing">Upgrade</Link>
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="p-5 rounded-2xl border border-border bg-foreground/[0.02] space-y-1">
                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-70">Credits balance</Label>
                        <p className="text-2xl font-black tabular-nums">{billingLoading ? "—" : billingStats.credits_balance}</p>
                      </div>
                      <div className="p-5 rounded-2xl border border-border bg-foreground/[0.02] space-y-1">
                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-70">Lifetime exports</Label>
                        <p className="text-2xl font-black tabular-nums">{billingLoading ? "—" : billingStats.export_count}</p>
                      </div>
                    </div>

                    {/* Self-serve cancellation/invoices require a Paddle customer-portal
                        session via PADDLE_API_KEY, which isn't configured on this backend
                        (only the webhook receiver exists today). Route to support instead
                        of fabricating a non-functional Cancel/Invoices button. */}
                    <div className="p-5 rounded-2xl border border-border bg-foreground/[0.02] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-sm font-bold tracking-tight text-foreground">Manage subscription</p>
                        <p className="text-[13px] font-medium text-muted-foreground leading-snug max-w-md">
                          Paddle emails a receipt with your invoice and a self-serve management link after every charge.
                          For anything else — including cancellation — contact support.
                        </p>
                      </div>
                      <Button variant="outline" className="h-10 px-5 rounded-xl font-bold text-sm shrink-0" asChild>
                        <a href="mailto:support@quickaishort.online">
                          <Mail className="w-3.5 h-3.5 mr-2" />
                          Contact support
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
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
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {THEMES.map((t) => {
                        const isActive = theme === t.id;
                        const Icon = t.icon;
                        return (
                          <button
                            key={t.id}
                            onClick={() => setTheme(t.id)}
                            aria-pressed={isActive}
                            aria-label={`Switch to ${t.name} theme`}
                            className={cn(
                              "group relative flex flex-col gap-4 rounded-2xl border p-4 text-left transition-all duration-200 focus-visible:outline-none",
                              isActive
                                ? "border-primary/50 bg-primary/[0.04] shadow-lg shadow-primary/5"
                                : "border-border hover:border-border-strong hover:bg-foreground/[0.02]",
                            )}
                          >
                            {/* Live preview swatch */}
                            <div
                              className="relative h-20 w-full rounded-xl overflow-hidden border border-black/5"
                              style={{ background: t.bg }}
                            >
                              <div className="absolute top-3 left-3 h-1.5 w-10 rounded-full" style={{ background: t.color, opacity: 0.9 }} />
                              <div className="absolute top-6 left-3 h-1.5 w-6 rounded-full" style={{ background: t.color, opacity: 0.35 }} />
                              <div className="absolute bottom-3 right-3 h-6 w-6 rounded-full" style={{ background: t.color }} />
                              {isActive && (
                                <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center shadow-md">
                                  <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                              <div className="min-w-0">
                                <p className={cn("text-sm font-bold tracking-tight leading-none", isActive ? "text-foreground" : "text-foreground/90")}>
                                  {t.name}
                                </p>
                                <p className="text-[11px] font-medium text-muted-foreground mt-1 leading-none">{t.description}</p>
                              </div>
                            </div>
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
                  <SaveRow
                    onSave={() => toast.success("Export defaults updated.")}
                    onReset={() => { setDefaultQuality("medium"); setDefaultAspect("9:16"); setCaptionsEnabled(true); }}
                  />
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
                      <div className="pt-2 border-t border-foreground/5">
                        <p className="text-sm font-bold mb-1">Editor tour</p>
                        <p className="text-xs text-muted-foreground mb-3">
                          Replay the first-run walkthrough on your next visit to the Editor.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-xl"
                          onClick={async () => {
                            const { requestTourReplay, saveOnboarding } = await import(
                              "@/lib/studio/onboarding"
                            );
                            requestTourReplay();
                            try {
                              await saveOnboarding("not_started", 0);
                            } catch {
                              /* local replay flag still works */
                            }
                            toast.success("Tour will start when you open the Editor.");
                          }}
                        >
                          Replay editor tour
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                  <SaveRow
                    onSave={() => toast.success("Studio preferences synchronized.")}
                    onReset={() => { setShowTelemetry(true); setAutoPlayOnSelect(true); }}
                  />
                </>
              )}

              {/* ── SHORTCUTS ── */}
              {activeTab === "shortcuts" && <ShortcutsTab />}

              {/* ── NOTIFICATIONS ── */}
              {activeTab === "notifications" && (
                <>
                  <Card className="depth-card glass-surface rounded-[2.5rem] border-foreground/5 p-4">
                    <CardHeader className="pb-8">
                      <CardTitle className="text-2xl font-black tracking-tight text-foreground/90">Alert System</CardTitle>
                      <CardDescription className="text-base font-medium">Manage production event notifications and status updates.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-8">
                      <ToggleRow label="Session Completion" description="Notify when high-fidelity renders are ready for download." checked={notifyCompletion} onCheckedChange={setNotifyCompletion} />
                      <ToggleRow label="Analysis Intelligence" description="Alert when viral mapping and face detection is complete." checked={notifyAnalysis} onCheckedChange={setNotifyAnalysis} border />
                      <ToggleRow label="Critical Overlays" description="Always display essential system status and hardware alerts." checked={notifyCritical} onCheckedChange={setNotifyCritical} border />
                    </CardContent>
                  </Card>
                  <SaveRow
                    onSave={() => toast.success("Notification preferences saved.")}
                    onReset={() => { setNotifyCompletion(true); setNotifyAnalysis(true); setNotifyCritical(true); }}
                  />
                </>
              )}

              {/* ── PRIVACY ── */}
              {activeTab === "privacy" && <PrivacyTab />}

              {/* ── REFERRAL ── */}
              {activeTab === "referral" && <ReferralsTab />}
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

function SaveRow({ onSave, onReset }: { onSave?: () => void; onReset?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-end gap-4 mt-8"
    >
      <Button
        variant="outline"
        className="h-14 px-10 rounded-2xl font-black uppercase tracking-widest text-[10px] border-foreground/10 hover:bg-foreground/5"
        onClick={onReset}
        disabled={!onReset}
      >
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

// ── KEYBOARD SHORTCUTS — interactive, persisted key-mapping ──────────────────

function KeyCombo({ combo, mac, dim }: { combo: string; mac: boolean; dim?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      {comboToChips(combo, mac).map((chip, i) => (
        <kbd
          key={i}
          className={cn(
            "inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-lg border px-2 text-xs font-bold tracking-tight shadow-sm",
            dim
              ? "border-border bg-secondary/50 text-muted-foreground"
              : "border-border-strong bg-secondary text-foreground",
          )}
        >
          {chip}
        </kbd>
      ))}
    </span>
  );
}

function ShortcutsTab() {
  const { bindings, setBinding, resetBinding, resetAll, findConflict } = useShortcutsStore();
  const [recordingId, setRecordingId] = useState<ShortcutId | null>(null);
  const [mac, setMac] = useState(true);

  useEffect(() => {
    const p = typeof navigator !== "undefined" ? `${navigator.platform} ${navigator.userAgent}` : "";
    setMac(/mac|iphone|ipad/i.test(p));
  }, []);

  // While recording, capture the next real key chord (capture phase, fully swallowed).
  useEffect(() => {
    if (!recordingId) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecordingId(null);
        return;
      }
      const combo = eventToCombo(e);
      if (!combo) return; // bare modifier — keep listening
      const conflict = findConflict(combo, recordingId);
      if (conflict) {
        const label = SHORTCUT_ACTIONS.find((a) => a.id === conflict)?.label ?? conflict;
        toast.error(`That chord is already mapped to “${label}”.`);
        setRecordingId(null);
        return;
      }
      setBinding(recordingId, combo);
      toast.success("Shortcut updated.");
      setRecordingId(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recordingId, findConflict, setBinding]);

  const anyChanged = SHORTCUT_ACTIONS.some((a) => bindings[a.id] !== DEFAULTS[a.id]);

  return (
    <Card className="depth-card glass-surface rounded-[2.5rem] border-foreground/5 p-4">
      <CardHeader className="pb-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <CardTitle className="text-2xl font-black tracking-tight">Keyboard Shortcuts</CardTitle>
            <CardDescription className="text-base font-medium">
              Click any shortcut, then press your new key chord. Changes save instantly and persist on this device.
            </CardDescription>
          </div>
          <AnimatePresence>
            {anyChanged && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={() => { resetAll(); setRecordingId(null); toast.success("Shortcuts restored to defaults."); }}
                className="shrink-0 inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-border text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset all
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-border rounded-2xl border border-border overflow-hidden">
          {SHORTCUT_ACTIONS.map((action) => {
            const isRecording = recordingId === action.id;
            const combo = bindings[action.id];
            const changed = combo !== DEFAULTS[action.id];
            return (
              <div
                key={action.id}
                className={cn(
                  "flex items-center justify-between gap-4 px-5 py-4 transition-colors",
                  isRecording ? "bg-primary/[0.06]" : "hover:bg-foreground/[0.02]",
                )}
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground tracking-tight">{action.label}</p>
                  <p className="text-[12px] font-medium text-muted-foreground mt-0.5 truncate">{action.description}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {changed && !isRecording && (
                    <button
                      onClick={() => resetBinding(action.id)}
                      title="Reset to default"
                      aria-label={`Reset ${action.label} to default`}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setRecordingId(isRecording ? null : action.id)}
                    aria-label={isRecording ? `Cancel rebinding ${action.label}` : `Rebind ${action.label}`}
                    className={cn(
                      "min-w-[5.5rem] h-10 px-3 rounded-xl border flex items-center justify-center gap-1.5 transition-all duration-200",
                      isRecording
                        ? "border-primary/50 bg-primary/10 ring-2 ring-primary/15"
                        : "border-border bg-secondary/40 hover:border-border-strong hover:bg-secondary/70",
                    )}
                  >
                    {isRecording ? (
                      <span className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                        <span className="text-[11px] font-bold uppercase tracking-widest text-primary">Press keys</span>
                      </span>
                    ) : (
                      <KeyCombo combo={combo} mac={mac} />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-[12px] font-medium text-muted-foreground/80 flex items-center gap-2">
          <Keyboard className="w-3.5 h-3.5 shrink-0" />
          While recording, press <KeyCombo combo="Escape" mac={mac} dim /> to cancel. Shortcuts are ignored while typing in a field.
        </p>
      </CardContent>
    </Card>
  );
}

// ── PRIVACY — comprehensive, transparent, interactive ────────────────────────

const STAYS_LOCAL = [
  "Raw video & audio — decoded and trimmed in-browser",
  "Whisper transcription & caption text",
  "Face-tracking and silence-detection passes",
  "Your editor preferences, themes & shortcuts",
];

const LEAVES_DEVICE = [
  "Encrypted session token (to keep you signed in)",
  "Clip metadata for the render queue — never the source media",
  "Aggregate, anonymous usage counts (optional, below)",
];

function PrivacyTab() {
  const [analytics, setAnalytics] = useLocalSetting<boolean>("qai_privacy_analytics", true);
  const [rememberHistory, setRememberHistory] = useLocalSetting<boolean>("qai_privacy_history", true);
  const [productUpdates, setProductUpdates] = useLocalSetting<boolean>("qai_email_product_updates", true);
  const [weeklyDigest, setWeeklyDigest] = useLocalSetting<boolean>("qai_email_weekly_digest", false);
  const [marketingEmails, setMarketingEmails] = useLocalSetting<boolean>("qai_email_marketing", false);

  const clearLocalData = () => {
    try {
      const keys = Object.keys(localStorage).filter(
        (k) => k.startsWith("qai_") || k === "qai-shortcuts" || k === "ui-preferences",
      );
      keys.forEach((k) => localStorage.removeItem(k));
      toast.success(`Cleared ${keys.length} local item${keys.length === 1 ? "" : "s"}. Refresh to apply.`);
    } catch {
      toast.error("Couldn't access local storage in this context.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero + transparency map */}
      <Card className="depth-card glass-surface rounded-[2.5rem] border-foreground/5 p-4">
        <CardHeader className="pb-6">
          <CardTitle className="text-2xl font-black tracking-tight">Privacy &amp; Data</CardTitle>
          <CardDescription className="text-base font-medium">
            Your media is processed on your device. Here is exactly what that means — no fine print.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-6 rounded-[1.75rem] bg-primary/[0.06] border border-primary/15 flex items-start gap-4">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5 text-primary" />
            </div>
            <div className="space-y-1.5">
              <p className="text-lg font-bold tracking-tight text-foreground">Zero-Trust processing</p>
              <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                FFmpeg, Whisper, and the vision models run as local Web Workers in your browser. Your raw
                source media is never uploaded to our servers.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl border border-border bg-foreground/[0.02] space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <p className="text-sm font-bold tracking-tight text-foreground">Stays on your device</p>
              </div>
              <ul className="space-y-2.5">
                {STAYS_LOCAL.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-[13px] font-medium text-muted-foreground leading-snug">
                    <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" strokeWidth={3} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-5 rounded-2xl border border-border bg-foreground/[0.02] space-y-4">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-bold tracking-tight text-foreground">Leaves your browser</p>
              </div>
              <ul className="space-y-2.5">
                {LEAVES_DEVICE.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-[13px] font-medium text-muted-foreground leading-snug">
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 mt-1.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data controls */}
      <Card className="depth-card glass-surface rounded-[2.5rem] border-foreground/5 p-4">
        <CardHeader className="pb-6">
          <CardTitle className="text-xl font-black tracking-tight">Data controls</CardTitle>
          <CardDescription className="text-base font-medium">You decide what we collect and what we keep.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ToggleRow
            label="Anonymous usage analytics"
            description="Share aggregate, de-identified product events to help us improve. Never tied to your media."
            checked={analytics}
            onCheckedChange={setAnalytics}
          />
          <ToggleRow
            label="Remember edit history"
            description="Keep your recent projects and undo history in this browser for faster resumes."
            checked={rememberHistory}
            onCheckedChange={setRememberHistory}
            border
          />
        </CardContent>
      </Card>

      {/* Email preferences */}
      <Card className="depth-card glass-surface rounded-[2.5rem] border-foreground/5 p-4">
        <CardHeader className="pb-6">
          <CardTitle className="text-xl font-black tracking-tight">Email preferences</CardTitle>
          <CardDescription className="text-base font-medium">
            Account essentials (welcome, billing receipts) always send — these control everything else.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ToggleRow
            label="Product updates"
            description="New features, important changes, and the occasional roadmap note."
            checked={productUpdates}
            onCheckedChange={setProductUpdates}
          />
          <ToggleRow
            label="Weekly digest"
            description="Your exports, AI runs, and credits — summarized once a week."
            checked={weeklyDigest}
            onCheckedChange={setWeeklyDigest}
            border
          />
          <ToggleRow
            label="Marketing"
            description="Offers, promotions, and partner announcements."
            checked={marketingEmails}
            onCheckedChange={setMarketingEmails}
            border
          />
        </CardContent>
      </Card>

      {/* Your data, your call */}
      <Card className="depth-card glass-surface rounded-[2.5rem] border-foreground/5 p-4">
        <CardHeader className="pb-6">
          <CardTitle className="text-xl font-black tracking-tight">Your data, your call</CardTitle>
          <CardDescription className="text-base font-medium">Reset locally stored preferences, or read the full policies.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-5 rounded-2xl border border-border bg-foreground/[0.02]">
            <div className="space-y-1">
              <p className="text-sm font-bold tracking-tight text-foreground">Clear local workspace data</p>
              <p className="text-[13px] font-medium text-muted-foreground leading-snug">
                Removes themes, shortcuts, and saved preferences from this browser. Your account is untouched.
              </p>
            </div>
            <button
              onClick={clearLocalData}
              className="shrink-0 inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl border border-destructive/30 text-destructive font-semibold text-sm hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Clear data
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link
              href="/privacy"
              className="group flex items-center justify-between gap-3 h-12 px-5 rounded-xl border border-border bg-foreground/[0.02] hover:bg-foreground/5 transition-colors"
            >
              <span className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
                <FileText className="w-4 h-4 text-muted-foreground" />
                Privacy Policy
              </span>
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </Link>
            <Link
              href="/terms"
              className="group flex items-center justify-between gap-3 h-12 px-5 rounded-xl border border-border bg-foreground/[0.02] hover:bg-foreground/5 transition-colors"
            >
              <span className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
                <FileText className="w-4 h-4 text-muted-foreground" />
                Terms of Service
              </span>
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ReferralsTab() {
  const [data, setData] = useState<{ credits: number; referrals: number; referralCode: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const t = useTranslations();

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch("/api/account/credits")
      .then((r) => r.json())
      .then((res) => {
        if (active) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const shareUrl = data?.referralCode
    ? `https://quickaishort.online/signup?ref=${data.referralCode}`
    : "https://quickaishort.online/signup";

  const copyToClipboard = () => {
    if (typeof navigator !== "undefined") {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success(t("referral.copied") || "Copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="depth-card glass-surface rounded-[2.5rem] border-foreground/5 p-4">
        <CardHeader className="pb-6">
          <CardTitle className="text-2xl font-black tracking-tight">{t("referral.title")}</CardTitle>
          <CardDescription className="text-base font-medium">
            {t("referral.subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-6 rounded-[1.75rem] bg-primary/[0.06] border border-primary/15 flex items-start gap-4">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div className="space-y-1.5 flex-1">
              <p className="text-lg font-bold tracking-tight text-foreground">{t("referral.yourLink")}</p>
              <div className="flex gap-2 items-center mt-2 max-w-xl">
                <Input
                  value={loading ? "Loading..." : shareUrl}
                  readOnly
                  className="h-11 rounded-xl bg-foreground/[0.03] border-foreground/5 font-mono text-xs focus:outline-none"
                />
                <Button
                  onClick={copyToClipboard}
                  disabled={loading}
                  className="h-11 px-5 rounded-xl font-bold text-xs shrink-0"
                >
                  {copied ? t("referral.copied") : t("referral.copy")}
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl border border-border bg-foreground/[0.02] space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-70">
                {t("referral.totalReferrals")}
              </Label>
              <p className="text-2xl font-black tabular-nums">{loading ? "—" : data?.referrals ?? 0}</p>
            </div>
            <div className="p-5 rounded-2xl border border-border bg-foreground/[0.02] space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-70">
                {t("referral.creditsEarned")}
              </Label>
              <p className="text-2xl font-black tabular-nums">{loading ? "—" : data?.credits ?? 0}</p>
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-border bg-foreground/[0.02] space-y-4">
            <h3 className="font-bold text-base text-foreground">{t("referral.howItWorks")}</h3>
            <ol className="space-y-3 pl-1">
              <li className="text-sm font-medium text-muted-foreground leading-snug flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</span>
                <span>{t("referral.step1")}</span>
              </li>
              <li className="text-sm font-medium text-muted-foreground leading-snug flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</span>
                <span>{t("referral.step2")}</span>
              </li>
              <li className="text-sm font-medium text-muted-foreground leading-snug flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</span>
                <span>{t("referral.step3")}</span>
              </li>
            </ol>
            <p className="text-xs text-muted-foreground pt-2 border-t border-foreground/5 mt-4">
              {t("referral.mutualBenefit")}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
