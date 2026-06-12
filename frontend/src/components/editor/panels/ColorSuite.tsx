"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editorStore";

// ── Section accordion ──────────────────────────────────────────────────────
function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-foreground bg-surface hover:bg-surface-2 transition-colors"
        aria-expanded={open}
      >
        {title}
        <ChevronDown
          size={12}
          className={cn(
            "transition-transform duration-150",
            open ? "rotate-180" : ""
          )}
        />
      </button>
      {open && <div className="px-3 pb-3 pt-2 bg-surface-2 space-y-2">{children}</div>}
    </div>
  );
}

// ── Slider row ─────────────────────────────────────────────────────────────
function SliderRow({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-[10px] text-muted shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 accent-primary"
      />
      <span className="w-10 text-[10px] text-muted text-right tabular-nums">
        {value.toFixed(2)}
      </span>
    </div>
  );
}

// ── RGB wheel row ──────────────────────────────────────────────────────────
function RgbRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: [number, number, number];
  min: number;
  max: number;
  onChange: (v: [number, number, number]) => void;
}) {
  const colors = ["R", "G", "B"] as const;
  return (
    <div className="space-y-1">
      <span className="text-[10px] text-muted">{label}</span>
      {colors.map((ch, i) => (
        <div key={ch} className="flex items-center gap-2">
          <span
            className={cn(
              "w-4 text-[10px] font-bold shrink-0",
              i === 0 ? "text-red-400" : i === 1 ? "text-green-400" : "text-blue-400"
            )}
          >
            {ch}
          </span>
          <input
            type="range"
            min={min}
            max={max}
            step={0.01}
            value={value[i]}
            onChange={(e) => {
              const next: [number, number, number] = [...value] as [number, number, number];
              next[i] = parseFloat(e.target.value);
              onChange(next);
            }}
            className="flex-1 h-1 accent-primary"
          />
          <span className="w-10 text-[10px] text-muted text-right tabular-nums">
            {value[i].toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function ColorSuite() {
  const clipColorState = useEditorStore((s) => s.clipColorState);
  const setClipColor = useEditorStore((s) => s.setClipColor);

  const {
    exposure = 0,
    contrast = 1,
    saturation = 1,
    lift = [0, 0, 0] as [number, number, number],
    gamma = [1, 1, 1] as [number, number, number],
    gain = [1, 1, 1] as [number, number, number],
    offset = [0, 0, 0] as [number, number, number],
    masterCurve = [] as Array<[number, number]>,
    hueShift = 0,
    satAdjust = 0,
    lumAdjust = 0,
    lutUrl = null as string | null,
    lutIntensity = 1,
  } = clipColorState ?? {};

  return (
    <div className="flex flex-col gap-2 p-2 h-full overflow-y-auto">
      {/* ── Basic ─────────────────────────────── */}
      <Section title="Basic" defaultOpen>
        <SliderRow label="Exposure" value={exposure} min={-3} max={3} onChange={(v) => setClipColor({ exposure: v })} />
        <SliderRow label="Contrast"  value={contrast}  min={0}  max={3} onChange={(v) => setClipColor({ contrast: v })} />
        <SliderRow label="Saturation" value={saturation} min={0} max={3} onChange={(v) => setClipColor({ saturation: v })} />
      </Section>

      {/* ── Color Wheels (CDL) ──────────────── */}
      <Section title="Color Wheels">
        <RgbRow label="Lift"   value={lift}   min={-1} max={1} onChange={(v) => setClipColor({ lift: v })} />
        <RgbRow label="Gamma"  value={gamma}  min={0.1} max={4} onChange={(v) => setClipColor({ gamma: v })} />
        <RgbRow label="Gain"   value={gain}   min={0}  max={4}  onChange={(v) => setClipColor({ gain: v })} />
        <RgbRow label="Offset" value={offset} min={-1} max={1}  onChange={(v) => setClipColor({ offset: v })} />
      </Section>

      {/* ── HSL Secondaries ─────────────────── */}
      <Section title="HSL Secondaries">
        <SliderRow label="Hue shift"  value={hueShift}  min={-180} max={180} step={1} onChange={(v) => setClipColor({ hueShift: v })} />
        <SliderRow label="Saturation" value={satAdjust} min={-100} max={100} step={1} onChange={(v) => setClipColor({ satAdjust: v })} />
        <SliderRow label="Luminance"  value={lumAdjust} min={-100} max={100} step={1} onChange={(v) => setClipColor({ lumAdjust: v })} />
      </Section>

      {/* ── LUT ─────────────────────────────── */}
      <Section title="LUT">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted w-20 shrink-0">LUT file URL</span>
            <input
              type="text"
              placeholder="https://…/film.cube"
              value={lutUrl ?? ""}
              onChange={(e) => setClipColor({ lutUrl: e.target.value || null })}
              className="flex-1 bg-surface border border-border rounded px-2 py-1 text-[10px] text-foreground placeholder:text-muted/50 outline-none focus:border-primary/50"
            />
          </div>
          <SliderRow
            label="Intensity"
            value={lutIntensity}
            min={0}
            max={1}
            onChange={(v) => setClipColor({ lutIntensity: v })}
          />
          {lutUrl && (
            <button
              onClick={() => setClipColor({ lutUrl: null })}
              className="text-[10px] text-red-400 hover:text-red-300 self-start"
            >
              Remove LUT
            </button>
          )}
        </div>
      </Section>

      {/* ── Reset ────────────────────────────── */}
      <button
        onClick={() => setClipColor(null)}
        className="mt-1 text-[10px] text-muted hover:text-red-400 self-start transition-colors"
      >
        Reset all color
      </button>
    </div>
  );
}
