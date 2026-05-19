"use client";

import { useEffect, useRef, useState } from "react";

const PHASES = ["Uploading...", "Processing...", "Scanning...", "Preparing..."];

const SKELETON_ROWS = [1, 0.72, 0.55];

export function UploadLoader() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      fadeRef.current = setTimeout(() => {
        setIdx((i) => (i + 1) % PHASES.length);
        setVisible(true);
      }, 300);
    }, 2200);
    return () => {
      clearInterval(interval);
      if (fadeRef.current) clearTimeout(fadeRef.current);
    };
  }, []);

  return (
    <div
      style={{
        width: 360,
        maxWidth: "100%",
        borderRadius: 20,
        border: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        padding: "18px 20px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        boxSizing: "border-box",
      }}
    >
      {/* Grid header: icon square + two skeleton lines + status pill */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Icon square */}
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            flexShrink: 0,
            background: "linear-gradient(135deg, #6ee7ff 0%, #b08cff 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path
              d="M9 12V4M9 4L6 7M9 4L12 7"
              stroke="white"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M3 14H15" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>

        {/* Two skeleton lines */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
          <div
            style={{
              position: "relative",
              overflow: "hidden",
              height: 10,
              borderRadius: 5,
              background: "rgba(255,255,255,0.08)",
            }}
          >
            <div className="tl-shimmer-bg" />
          </div>
          <div
            style={{
              position: "relative",
              overflow: "hidden",
              height: 8,
              width: "65%",
              borderRadius: 4,
              background: "rgba(255,255,255,0.05)",
            }}
          >
            <div className="tl-shimmer-bg" />
          </div>
        </div>

        {/* Status pill */}
        <div
          style={{
            flexShrink: 0,
            background: "rgba(176,140,255,0.12)",
            border: "1px solid rgba(176,140,255,0.25)",
            borderRadius: 999,
            padding: "4px 10px",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.10em",
            color: "#b08cff",
            textTransform: "uppercase",
            transition: "opacity 0.3s ease",
            opacity: visible ? 1 : 0,
            whiteSpace: "nowrap",
          }}
        >
          {PHASES[idx]}
        </div>
      </div>

      {/* Three skeleton rows */}
      {SKELETON_ROWS.map((w, i) => (
        <div
          key={i}
          style={{
            position: "relative",
            overflow: "hidden",
            height: 12,
            width: `${w * 100}%`,
            borderRadius: 6,
            background: "rgba(255,255,255,0.05)",
          }}
        >
          <div
            className="tl-shimmer-bg"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        </div>
      ))}

      {/* Bottom progress bar */}
      <div
        style={{
          height: 4,
          borderRadius: 999,
          background: "rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        <div className="tl-progress-bar" />
      </div>
    </div>
  );
}
