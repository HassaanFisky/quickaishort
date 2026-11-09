"use client";

import React from "react";
import { useEditorStore } from "@/stores/editorStore";
import {
  MODE_PACKS,
  type ModePackId,
  getModePack,
} from "@/lib/modepacks/modePacks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Smartphone,
  Tv,
  Mic,
  Megaphone,
  GraduationCap,
  ChevronDown,
  Shield,
  ShieldCheck,
  Check,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ICONS: Record<string, React.ElementType> = {
  Smartphone,
  Tv,
  Mic,
  Megaphone,
  GraduationCap,
};

interface ModePackSelectorProps {
  className?: string;
  showSafeZoneToggle?: boolean;
}

export function ModePackSelector({
  className,
  showSafeZoneToggle = true,
}: ModePackSelectorProps) {
  const activeModePack = useEditorStore((s) => s.activeModePack);
  const setModePack = useEditorStore((s) => s.setModePack);
  const safeZonesEnabled = useEditorStore((s) => s.safeZonesEnabled);
  const setSafeZonesEnabled = useEditorStore((s) => s.setSafeZonesEnabled);

  const currentPack = getModePack(activeModePack);
  const IconComponent = ICONS[currentPack.iconName] || Layers;

  const handleSelectModePack = (id: ModePackId) => {
    if (id === activeModePack) return;
    const nextPack = getModePack(id);
    setModePack(id);
    toast.success(`ModePack: ${nextPack.name}`, {
      description: `Applied ${nextPack.aspectRatio} canvas, ${nextPack.lufsTarget} LUFS audio target & ${nextPack.captionPreset.styleName} captions`,
    });
  };

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "h-8 px-2.5 rounded-xl flex items-center gap-2 text-xs font-semibold",
              "bg-card border border-border hover:border-primary/40 transition-all duration-200",
              "text-foreground shadow-sm group hover:bg-secondary/40"
            )}
            aria-label={`Current ModePack: ${currentPack.name}. Click to switch.`}
          >
            <IconComponent className="w-3.5 h-3.5 text-primary group-hover:scale-110 transition-transform" />
            <span className="hidden sm:inline font-bold">{currentPack.shortLabel}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
              {currentPack.aspectRatio}
            </span>
            <span className="text-[10px] font-mono text-fg-muted hidden md:inline">
              {currentPack.lufsTarget} LUFS
            </span>
            <ChevronDown className="w-3 h-3 text-fg-muted group-hover:text-foreground transition-colors" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          className="w-80 p-2 bg-popover/95 backdrop-blur-xl border border-border shadow-2xl rounded-2xl z-[120]"
        >
          <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center justify-between">
            <span>Studio ModePacks</span>
            <span className="text-[9px] font-normal lowercase tracking-normal text-primary">
              1-click canvas & preset OS
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-border/60 my-1" />

          <div className="flex flex-col gap-1">
            {(Object.keys(MODE_PACKS) as ModePackId[]).map((packId) => {
              const pack = MODE_PACKS[packId];
              const ItemIcon = ICONS[pack.iconName] || Layers;
              const isSelected = packId === activeModePack;

              return (
                <DropdownMenuItem
                  key={packId}
                  onClick={() => handleSelectModePack(packId)}
                  className={cn(
                    "flex items-start gap-3 p-2.5 rounded-xl cursor-pointer transition-colors outline-none",
                    isSelected
                      ? "bg-primary/15 border border-primary/30 text-foreground"
                      : "hover:bg-secondary/60 text-muted-foreground hover:text-foreground border border-transparent"
                  )}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                      isSelected
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    <ItemIcon className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-foreground">
                        {pack.name}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-secondary text-foreground border border-border">
                          {pack.aspectRatio}
                        </span>
                        <span className="text-[9px] font-mono text-muted-foreground">
                          {pack.lufsTarget} LUFS
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-primary ml-0.5" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                      {pack.description}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 text-[9px] text-muted-foreground/80">
                      <span className="truncate">
                        Style: <strong className="text-foreground/80">{pack.captionPreset.styleName}</strong>
                      </span>
                      <span>·</span>
                      <span className="truncate">
                        Safe Zone: <strong className="text-foreground/80">{pack.safeZone.label}</strong>
                      </span>
                    </div>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Safe Zones Toggle Button */}
      {showSafeZoneToggle && (
        <button
          type="button"
          onClick={() => setSafeZonesEnabled(!safeZonesEnabled)}
          title={safeZonesEnabled ? "Hide Safe Zone Guides" : "Show Safe Zone Guides"}
          aria-label={safeZonesEnabled ? "Hide Safe Zone Guides" : "Show Safe Zone Guides"}
          aria-pressed={safeZonesEnabled}
          className={cn(
            "h-8 px-2 rounded-xl flex items-center gap-1.5 text-xs font-semibold border transition-all duration-200",
            safeZonesEnabled
              ? "bg-primary/10 border-primary/40 text-primary shadow-sm"
              : "bg-card border-border text-fg-muted hover:text-foreground"
          )}
        >
          {safeZonesEnabled ? (
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
          ) : (
            <Shield className="w-3.5 h-3.5" />
          )}
          <span className="text-[10px] font-mono hidden xl:inline">
            Safe Zones
          </span>
        </button>
      )}
    </div>
  );
}
export default ModePackSelector;
