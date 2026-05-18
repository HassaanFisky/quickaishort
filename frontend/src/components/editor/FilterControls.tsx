"use client";

import React from "react";
import { useEditorStore } from "@/stores/editorStore";

const FILTERS = [
  { key: "brightness" as const, label: "Bright",   min: 0.5, max: 2,    step: 0.05, default: 1 },
  { key: "contrast"   as const, label: "Contrast", min: 0.5, max: 2,    step: 0.05, default: 1 },
  { key: "saturation" as const, label: "Color",    min: 0,   max: 2,    step: 0.05, default: 1 },
  { key: "hue"        as const, label: "Hue",      min: -180, max: 180, step: 1,    default: 0 },
  { key: "blur"       as const, label: "Blur",     min: 0,   max: 10,   step: 0.1,  default: 0 },
];

export function FilterControls() {
  const { frameFilters, setFrameFilter, resetFrameFilters } = useEditorStore();

  return (
    <div className="filter-controls">
      <div className="filter-header">
        <span className="filter-title">Adjustments</span>
        <button className="filter-reset" onClick={resetFrameFilters}>
          Reset
        </button>
      </div>
      {FILTERS.map((f) => (
        <div key={f.key} className="filter-row">
          <label className="filter-label">{f.label}</label>
          <input
            type="range"
            min={f.min}
            max={f.max}
            step={f.step}
            value={frameFilters[f.key]}
            onChange={(e) => setFrameFilter({ [f.key]: parseFloat(e.target.value) })}
            className="filter-slider"
          />
          <span className="filter-value">
            {f.key === "hue" ? `${frameFilters[f.key]}°` : frameFilters[f.key].toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}
