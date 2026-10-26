"use client";

import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { GENERAL_EMAIL, mailto } from "@/lib/email-addresses";
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
  { id: "dark",  name: "Studio Dark",   description: "Balanced graphite",  icon: Droplets, color: "#6366f1", bg: "#0d0e12" },
  { id: "oled",  name: "OLED Pitch",    description: "Pure-black contrast", icon: Zap,      color: "#818cf8", bg: "#000000" },
  { id: "light", name: "Creator Light", description: "High-key daylight",   icon: Sun,      color: "#4f46e5", bg: "#f8fafc" },
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

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "billing" || tab === "profile" || tab === "appearance" || tab === "export" || tab === "editor" || tab === "shortcuts" || tab === "notifications" || tab === "privacy" || tab === "referral") {
      setActiveTab(tab as Tab);
    }
  }, []);

  const [displayName, setDisplayName] = useState(session?.user?.name ?? "");
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
  const isProSession = Boolean((session?.user as { isPro?: boolean } | undefined)?.isPro) || billingStats.is_pro;

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
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">
          Studio Settings
        </h1>
        <p className="text-[13px] text-muted-foreground">
          Account identity, billing, theme, keyboard shortcuts, and default studio behavior.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-8">
        {/* Sidebar Nav */}
        <nav className="md:col-span-3 flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0 scrollbar-none" aria-label="Settings sections">
          {TABS.map(({ id, icon: Icon, label }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={cn(
                  "flex items-center gap-2.5 h-10 px-3.5 rounded-xl text-[13px] font-medium transition-colors text-left shrink-0",
                  active
                    ? "bg-primary/10 text-primary border border-primary/25"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground border border-transparent",
                )}
              >
                <Icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                {label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div className="md:col-span-9 min-w-0">
          <div className="space-y-6">
              {/* ── PROFILE ── */}
              {activeTab === "profile" && (
                <>
                  <Card className="rounded-2xl border-border bg-card">
                    <CardHeader className="pb-5">
                      <CardTitle className="text-base font-semibold tracking-tight text-foreground">Identity &amp; Account</CardTitle>
                      <CardDescription className="text-[13px] text-muted-foreground">
                        Manage your display identity and view your current plan tier.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl bg-secondary/40 border border-border">
                        <Avatar className="w-16 h-16 border border-border shrink-0">
                          <AvatarImage src={session?.user?.image || ""} />
                          <AvatarFallback className="text-xl font-semibold bg-primary/15 text-primary">
                            {session?.user?.name?.[0]?.toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <h3 className="font-semibold text-base text-foreground truncate">
                              {session?.user?.name || "Studio Creator"}
                            </h3>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] font-medium px-2 py-0.5",
                                isProSession
                                  ? "bg-primary/10 border-primary/30 text-primary"
                                  : "bg-secondary border-border text-muted-foreground",
                              )}
                            >
                              {isProSession ? "Pro plan" : "Free plan"}
                            </Badge>
                          </div>
                          <p className="text-[12px] text-muted-foreground truncate">
                            {session?.user?.email || "Local workspace session"}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-2">
                          <Label className="text-[12px] font-medium text-muted-foreground">Display name</Label>
                          <Input
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Your name"
                            className="h-10 rounded-xl bg-background border-border text-[13px]"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[12px] font-medium text-muted-foreground">Account email</Label>
                          <Input
                            value={session?.user?.email || ""}
                            readOnly
                            className="h-10 rounded-xl bg-secondary/40 border-border font-mono text-[12px] text-muted-foreground"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <SaveRow
                    saveLabel="Save profile"
                    onSave={() => toast.success("Profile updated.")}
                    onReset={() => setDisplayName(session?.user?.name ?? "")}
                  />
                </>
              )}

              {/* ── BILLING ── */}
              {activeTab === "billing" && (
                <Card className="rounded-2xl border-border bg-card">
                  <CardHeader className="pb-5">
                    <CardTitle className="text-base font-semibold tracking-tight text-foreground">Billing &amp; Credits</CardTitle>
                    <CardDescription className="text-[13px] text-muted-foreground">
                      Your plan tier, credit balance, and subscription status.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl bg-secondary/40 border border-border">
                      <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center shrink-0">
                        <Sparkles className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 mb-0.5">
                          <h3 className="font-semibold text-base text-foreground">
                            {billingLoading ? "—" : billingStats.is_pro ? "Pro" : "Free"}
                          </h3>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-medium",
                              billingStats.is_pro
                                ? "bg-primary/10 border-primary/30 text-primary"
                                : "bg-secondary border-border text-muted-foreground",
                            )}
                          >
                            {billingStats.is_pro ? "Active" : "Starter tier"}
                          </Badge>
                        </div>
                        <p className="text-[12px] text-muted-foreground">
                          {billingStats.is_pro
                            ? "$29/month · billed via Paddle"
                            : "720p exports with watermark · Upgrade to Pro for 4K exports and monthly credit grants."}
                        </p>
                      </div>
                      {!billingStats.is_pro && (
                        <Button size="sm" className="h-9 px-4 rounded-xl text-[12px] font-medium shrink-0" asChild>
                          <Link href="/pricing">Upgrade to Pro</Link>
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl border border-border bg-background space-y-1">
                        <Label className="text-[11px] font-medium text-muted-foreground">Credits balance</Label>
                        <p className="text-xl font-semibold tabular-nums text-foreground">
                          {billingLoading ? "—" : billingStats.credits_balance}
                        </p>
                      </div>
                      <div className="p-4 rounded-xl border border-border bg-background space-y-1">
                        <Label className="text-[11px] font-medium text-muted-foreground">Lifetime exports</Label>
                        <p className="text-xl font-semibold tabular-nums text-foreground">
                          {billingLoading ? "—" : billingStats.export_count}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-border bg-background flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-[13px] font-medium text-foreground">Manage subscription</p>
                        <p className="text-[12px] text-muted-foreground leading-relaxed max-w-md">
                          Paddle emails a receipt with your invoice and a self-serve management link after every charge.
                          For billing questions or cancellation assistance, contact support.
                        </p>
                      </div>
                      <Button variant="outline" size="sm" className="h-9 px-4 rounded-xl text-[12px] font-medium shrink-0" asChild>
                        <a href={mailto(GENERAL_EMAIL)}>
                          <Mail className="w-3.5 h-3.5 mr-1.5" />
                          Contact support
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── APPEARANCE ── */}
              {activeTab === "appearance" && (
                <Card className="rounded-2xl border-border bg-card">
                  <CardHeader className="pb-5">
                    <CardTitle className="text-base font-semibold tracking-tight text-foreground">
                      Theme
                    </CardTitle>
                    <CardDescription className="text-[13px] text-muted-foreground">
                      Select your workspace appearance — applied immediately and saved on this device.
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
                            type="button"
                            onClick={() => setTheme(t.id)}
                            aria-pressed={isActive}
                            aria-label={`Switch to ${t.name} theme`}
                            className={cn(
                              "group relative flex flex-col gap-3 rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-none",
                              isActive
                                ? "border-primary/50 bg-primary/[0.05]"
                                : "border-border bg-background hover:border-border-strong",
                            )}
                          >
                            <div
                              className="relative h-20 w-full rounded-lg overflow-hidden border border-black/10"
                              style={{ background: t.bg }}
                            >
                              <div className="absolute top-3 left-3 h-1.5 w-10 rounded-full" style={{ background: t.color, opacity: 0.9 }} />
                              <div className="absolute top-6 left-3 h-1.5 w-6 rounded-full" style={{ background: t.color, opacity: 0.35 }} />
                              <div className="absolute bottom-3 right-3 h-5 w-5 rounded-full" style={{ background: t.color }} />
                              {isActive && (
                                <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                                  <Check className="h-3 w-3 text-white" strokeWidth={3} />
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                              <div className="min-w-0">
                                <p className="text-[13px] font-medium text-foreground leading-none">
                                  {t.name}
                                </p>
                                <p className="text-[11px] text-muted-foreground mt-1 leading-none">{t.description}</p>
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
                  <Card className="rounded-2xl border-border bg-card">
                    <CardHeader className="pb-5">
                      <CardTitle className="text-base font-semibold tracking-tight text-foreground">Export Defaults</CardTitle>
                      <CardDescription className="text-[13px] text-muted-foreground">
                        Default output parameters applied when initializing a new export. Changes save automatically.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="space-y-2.5">
                        <Label className="text-[12px] font-medium text-muted-foreground">
                          Default rendering quality
                        </Label>
                        <div className="flex gap-2.5">
                          {QUALITY_OPTIONS.map((q) => (
                            <button
                              key={q}
                              type="button"
                              onClick={() => setDefaultQuality(q)}
                              className={cn(
                                "flex-1 h-10 rounded-xl text-[12px] font-medium capitalize border transition-colors",
                                defaultQuality === q
                                  ? "bg-primary/10 border-primary/40 text-primary"
                                  : "bg-background border-border text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2.5 border-t border-border pt-6">
                        <Label className="text-[12px] font-medium text-muted-foreground">
                          Default aspect ratio
                        </Label>
                        <div className="flex gap-2.5">
                          {ASPECT_OPTIONS.map((a) => (
                            <button
                              key={a}
                              type="button"
                              onClick={() => setDefaultAspect(a)}
                              className={cn(
                                "flex-1 h-10 rounded-xl text-[12px] font-medium border transition-colors",
                                defaultAspect === a
                                  ? "bg-primary/10 border-primary/40 text-primary"
                                  : "bg-background border-border text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {a} Ratio
                            </button>
                          ))}
                        </div>
                      </div>

                      <ToggleRow
                        label="Burn captions by default"
                        description="Automatically enable timed captions when opening the export dialog."
                        checked={captionsEnabled}
                        onCheckedChange={setCaptionsEnabled}
                        border
                      />
                    </CardContent>
                  </Card>
                  <SaveRow
                    onReset={() => {
                      setDefaultQuality("medium");
                      setDefaultAspect("9:16");
                      setCaptionsEnabled(true);
                      toast.success("Export defaults restored.");
                    }}
                  />
                </>
              )}

              {/* ── EDITOR ── */}
              {activeTab === "editor" && (
                <>
                  <Card className="rounded-2xl border-border bg-card">
                    <CardHeader className="pb-5">
                      <CardTitle className="text-base font-semibold tracking-tight text-foreground">Editor Behavior</CardTitle>
                      <CardDescription className="text-[13px] text-muted-foreground">
                        Control playback behavior, telemetry display, and walkthrough onboarding.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <ToggleRow
                        label="Studio telemetry overlay"
                        description="Display real-time worker and AI status metrics in development."
                        checked={showTelemetry}
                        onCheckedChange={setShowTelemetry}
                      />
                      <ToggleRow
                        label="Autoplay on clip selection"
                        description="Start canvas preview automatically when focusing a timeline clip."
                        checked={autoPlayOnSelect}
                        onCheckedChange={setAutoPlayOnSelect}
                        border
                      />
                      <div className="pt-6 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <p className="text-[13px] font-medium text-foreground">Editor walkthrough tour</p>
                          <p className="text-[12px] text-muted-foreground">
                            Replay the interactive onboarding guide on your next visit to the Editor.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 rounded-xl text-[12px] shrink-0"
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
                    onReset={() => {
                      setShowTelemetry(true);
                      setAutoPlayOnSelect(true);
                      toast.success("Editor preferences restored.");
                    }}
                  />
                </>
              )}

              {/* ── SHORTCUTS ── */}
              {activeTab === "shortcuts" && <ShortcutsTab />}

              {/* ── NOTIFICATIONS ── */}
              {activeTab === "notifications" && (
                <>
                  <Card className="rounded-2xl border-border bg-card">
                    <CardHeader className="pb-5">
                      <CardTitle className="text-base font-semibold tracking-tight text-foreground">Workspace Alerts</CardTitle>
                      <CardDescription className="text-[13px] text-muted-foreground">
                        Choose which in-app notifications appear during editing and rendering.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <ToggleRow
                        label="Render completion"
                        description="Notify when client or server video exports finish rendering."
                        checked={notifyCompletion}
                        onCheckedChange={setNotifyCompletion}
                      />
                      <ToggleRow
                        label="Analysis completion"
                        description="Notify when transcription, silence detection, and clip analysis finish."
                        checked={notifyAnalysis}
                        onCheckedChange={setNotifyAnalysis}
                        border
                      />
                      <ToggleRow
                        label="Critical system alerts"
                        description="Always display quota warnings, connection errors, and job failures."
                        checked={notifyCritical}
                        onCheckedChange={setNotifyCritical}
                        border
                      />
                    </CardContent>
                  </Card>
                  <SaveRow
                    onReset={() => {
                      setNotifyCompletion(true);
                      setNotifyAnalysis(true);
                      setNotifyCritical(true);
                      toast.success("Notification preferences restored.");
                    }}
                  />
                </>
              )}

              {/* ── PRIVACY ── */}
              {activeTab === "privacy" && <PrivacyTab />}

              {/* ── REFERRAL ── */}
              {activeTab === "referral" && <ReferralsTab />}
          </div>
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
    <div className={cn("flex items-center justify-between gap-4", border && "border-t border-border pt-6")}>
      <div className="space-y-0.5 pr-4">
        <Label className="text-[13px] font-medium text-foreground">{label}</Label>
        <p className="text-[12px] text-muted-foreground max-w-lg leading-relaxed">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="data-[state=checked]:bg-primary"
      />
    </div>
  );
}

function SaveRow({
  onSave,
  onReset,
  saveLabel = "Save changes",
}: {
  onSave?: () => void;
  onReset?: () => void;
  saveLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 pt-2">
      <p className="text-[12px] text-muted-foreground">
        {onSave ? "Review your changes before saving." : "Preferences on this tab save automatically."}
      </p>
      <div className="flex items-center gap-2.5">
        {onReset && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 px-4 rounded-xl text-[12px] font-medium"
            onClick={onReset}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Reset defaults
          </Button>
        )}
        {onSave && (
          <Button
            type="button"
            size="sm"
            className="h-9 px-4 rounded-xl text-[12px] font-medium"
            onClick={onSave}
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {saveLabel}
          </Button>
        )}
      </div>
    </div>
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
            "inline-flex h-6 min-w-[1.6rem] items-center justify-center rounded-md border px-1.5 text-[11px] font-semibold tracking-tight",
            dim
              ? "border-border bg-secondary/50 text-muted-foreground"
              : "border-border-strong bg-background text-foreground",
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
      if (!combo) return;
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
    <Card className="rounded-2xl border-border bg-card">
      <CardHeader className="pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold tracking-tight text-foreground">Keyboard Shortcuts</CardTitle>
            <CardDescription className="text-[13px] text-muted-foreground">
              Click any shortcut and press a new key chord. Bindings persist locally on this device.
            </CardDescription>
          </div>
          {anyChanged && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { resetAll(); setRecordingId(null); toast.success("Shortcuts restored to defaults."); }}
              className="h-8 px-3 rounded-xl text-[12px] font-medium shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Reset all
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-background overflow-hidden">
          {SHORTCUT_ACTIONS.map((action) => {
            const isRecording = recordingId === action.id;
            const combo = bindings[action.id];
            const changed = combo !== DEFAULTS[action.id];
            return (
              <div
                key={action.id}
                className={cn(
                  "flex items-center justify-between gap-4 px-4 py-3 transition-colors",
                  isRecording ? "bg-primary/[0.08]" : "hover:bg-secondary/40",
                )}
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground">{action.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{action.description}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {changed && !isRecording && (
                    <button
                      type="button"
                      onClick={() => resetBinding(action.id)}
                      title="Reset to default"
                      aria-label={`Reset ${action.label} to default`}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setRecordingId(isRecording ? null : action.id)}
                    aria-label={isRecording ? `Cancel rebinding ${action.label}` : `Rebind ${action.label}`}
                    className={cn(
                      "min-w-[5rem] h-9 px-3 rounded-lg border flex items-center justify-center gap-1.5 transition-colors",
                      isRecording
                        ? "border-primary/60 bg-primary/10"
                        : "border-border bg-card hover:border-border-strong",
                    )}
                  >
                    {isRecording ? (
                      <span className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                        <span className="text-[11px] font-semibold text-primary">Press keys</span>
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
        <p className="mt-3 text-[12px] text-muted-foreground flex items-center gap-2">
          <Keyboard className="w-3.5 h-3.5 shrink-0" />
          While recording, press <KeyCombo combo="Escape" mac={mac} dim /> to cancel. Shortcuts are ignored while typing in an input.
        </p>
      </CardContent>
    </Card>
  );
}

// ── PRIVACY — transparent, accurate hybrid architecture summary ──────────────

const STAYS_LOCAL = [
  "In-browser video preview, waveform extraction, and silence detection",
  "Client-side Whisper transcription and local FFmpeg.wasm cuts",
  "Your workspace theme, keyboard shortcuts, and UI preferences",
];

const SERVER_AND_CLOUD = [
  "Authenticated session tokens and project/timeline state sync",
  "Conversational AI prompts & transcript context sent to Gemini when you run AI commands",
  "Uploaded clips and render jobs when using server-side FFmpeg exports or cloud dubbing",
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
      toast.success(`Cleared ${keys.length} local preference item${keys.length === 1 ? "" : "s"}. Refresh to apply.`);
    } catch {
      toast.error("Couldn't access local storage in this context.");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border-border bg-card">
        <CardHeader className="pb-5">
          <CardTitle className="text-base font-semibold tracking-tight text-foreground">Privacy &amp; Data Architecture</CardTitle>
          <CardDescription className="text-[13px] text-muted-foreground">
            How QuickAI Studio processes your media across browser workers and cloud execution services.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="p-4 rounded-xl bg-primary/[0.06] border border-primary/20 flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-[13px] font-semibold text-foreground">Hybrid local + cloud pipeline</p>
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                Preview, silence detection, and client-side cuts run directly in your browser. When you invoke conversational AI commands, server-side renders, or cloud dubbing, only the required media and metadata are processed by our backend and never used to train proprietary models without consent.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-border bg-background space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <p className="text-[13px] font-medium text-foreground">Runs locally in your browser</p>
              </div>
              <ul className="space-y-2">
                {STAYS_LOCAL.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[12px] text-muted-foreground leading-snug">
                    <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" strokeWidth={2.5} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-4 rounded-xl border border-border bg-background space-y-3">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-muted-foreground" />
                <p className="text-[13px] font-medium text-foreground">Processed by Studio backend</p>
              </div>
              <ul className="space-y-2">
                {SERVER_AND_CLOUD.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[12px] text-muted-foreground leading-snug">
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data controls */}
      <Card className="rounded-2xl border-border bg-card">
        <CardHeader className="pb-5">
          <CardTitle className="text-base font-semibold tracking-tight text-foreground">Data Controls</CardTitle>
          <CardDescription className="text-[13px] text-muted-foreground">
            Control telemetry and local session persistence.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ToggleRow
            label="Anonymous usage analytics"
            description="Share aggregate, de-identified product events to help improve reliability."
            checked={analytics}
            onCheckedChange={setAnalytics}
          />
          <ToggleRow
            label="Remember edit history locally"
            description="Keep recent project drafts and undo state in this browser for faster resumes."
            checked={rememberHistory}
            onCheckedChange={setRememberHistory}
            border
          />
        </CardContent>
      </Card>

      {/* Email preferences */}
      <Card className="rounded-2xl border-border bg-card">
        <CardHeader className="pb-5">
          <CardTitle className="text-base font-semibold tracking-tight text-foreground">Email Preferences</CardTitle>
          <CardDescription className="text-[13px] text-muted-foreground">
            Transactional account emails and billing receipts are always sent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ToggleRow
            label="Product updates"
            description="New studio capabilities, release notes, and major platform updates."
            checked={productUpdates}
            onCheckedChange={setProductUpdates}
          />
          <ToggleRow
            label="Weekly activity summary"
            description="Your exports, AI command runs, and credit usage summarized weekly."
            checked={weeklyDigest}
            onCheckedChange={setWeeklyDigest}
            border
          />
          <ToggleRow
            label="Promotional announcements"
            description="Occasional plan offers and creator announcements."
            checked={marketingEmails}
            onCheckedChange={setMarketingEmails}
            border
          />
        </CardContent>
      </Card>

      {/* Your data, your call */}
      <Card className="rounded-2xl border-border bg-card">
        <CardHeader className="pb-5">
          <CardTitle className="text-base font-semibold tracking-tight text-foreground">Local Storage &amp; Legal Policies</CardTitle>
          <CardDescription className="text-[13px] text-muted-foreground">
            Reset locally stored browser preferences or review our terms and privacy documentation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 rounded-xl border border-border bg-background">
            <div className="space-y-0.5">
              <p className="text-[13px] font-medium text-foreground">Clear local workspace preferences</p>
              <p className="text-[12px] text-muted-foreground">
                Removes themes, custom shortcuts, and saved toggles from this browser. Your account is untouched.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearLocalData}
              className="h-9 px-4 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 text-[12px] font-medium shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Clear local data
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link
              href="/privacy"
              className="group flex items-center justify-between gap-3 h-10 px-4 rounded-xl border border-border bg-background hover:border-border-strong transition-colors"
            >
              <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                <FileText className="w-4 h-4 text-muted-foreground" />
                Privacy Policy
              </span>
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </Link>
            <Link
              href="/terms"
              className="group flex items-center justify-between gap-3 h-10 px-4 rounded-xl border border-border bg-background hover:border-border-strong transition-colors"
            >
              <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
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
      <Card className="rounded-2xl border-border bg-card">
        <CardHeader className="pb-5">
          <CardTitle className="text-base font-semibold tracking-tight text-foreground">{t("referral.title")}</CardTitle>
          <CardDescription className="text-[13px] text-muted-foreground">
            {t("referral.subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 rounded-xl bg-primary/[0.06] border border-primary/20 flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <div className="space-y-2 flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground">{t("referral.yourLink")}</p>
              <div className="flex gap-2 items-center max-w-xl">
                <Input
                  value={loading ? "Loading..." : shareUrl}
                  readOnly
                  className="h-9 rounded-xl bg-background border-border font-mono text-[12px] focus:outline-none"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={copyToClipboard}
                  disabled={loading}
                  className="h-9 px-4 rounded-xl font-medium text-[12px] shrink-0"
                >
                  {copied ? t("referral.copied") : t("referral.copy")}
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-border bg-background space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">
                {t("referral.totalReferrals")}
              </Label>
              <p className="text-xl font-semibold tabular-nums text-foreground">{loading ? "—" : data?.referrals ?? 0}</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-background space-y-1">
              <Label className="text-[11px] font-medium text-muted-foreground">
                {t("referral.creditsEarned")}
              </Label>
              <p className="text-xl font-semibold tabular-nums text-foreground">{loading ? "—" : data?.credits ?? 0}</p>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-border bg-background space-y-3">
            <h3 className="font-medium text-[13px] text-foreground">{t("referral.howItWorks")}</h3>
            <ol className="space-y-2.5 pl-1">
              <li className="text-[12px] text-muted-foreground leading-snug flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-semibold shrink-0">1</span>
                <span>{t("referral.step1")}</span>
              </li>
              <li className="text-[12px] text-muted-foreground leading-snug flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-semibold shrink-0">2</span>
                <span>{t("referral.step2")}</span>
              </li>
              <li className="text-[12px] text-muted-foreground leading-snug flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-semibold shrink-0">3</span>
                <span>{t("referral.step3")}</span>
              </li>
            </ol>
            <p className="text-[11px] text-muted-foreground pt-2 border-t border-border">
              {t("referral.mutualBenefit")}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
