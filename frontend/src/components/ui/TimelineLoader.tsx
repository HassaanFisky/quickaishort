"use client";

import { useEffect, useRef, useState } from "react";

interface TimelineLoaderProps {
  phases?: string[];
}

const CLIP_BLOCKS_TRACK1 = [
  { left: 10,  w: 58 },
  { left: 76,  w: 88 },
  { left: 172, w: 52 },
  { left: 232, w: 82 },
  { left: 322, w: 44 },
];

const CLIP_BLOCKS_TRACK2 = [
  { left: 14,  w: 42 },
  { left: 64,  w: 112 },
  { left: 184, w: 68 },
  { left: 260, w: 56 },
];

export function TimelineLoader({ phases = ["Processing..."] }: TimelineLoaderProps) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (phases.length <= 1) return;
    const interval = setInterval(() => {
      setVisible(false);
      fadeRef.current = setTimeout(() => {
        setIdx((i) => (i + 1) % phases.length);
        setVisible(true);
      }, 300);
    }, 2200);
    return () => {
      clearInterval(interval);
      if (fadeRef.current) clearTimeout(fadeRef.current);
    };
  }, [phases.length]);

  return (
    <div
      style={{
        width: 380,
        maxWidth: "100%",
        borderRadius: 20,
        border: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        padding: "20px 20px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        boxSizing: "border-box",
      }}
    >
      {/* Header: shimmer bar + status chip */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div
          style={{
            flex: 1,
            height: 10,
            borderRadius: 6,
            background: "rgba(255,255,255,0.07)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div className="tl-shimmer-bg" />
        </div>

        <div
          style={{
            flexShrink: 0,
            background: "rgba(110,231,255,0.10)",
            border: "1px solid rgba(110,231,255,0.22)",
            borderRadius: 999,
            padding: "4px 12px",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.12em",
            color: "#6ee7ff",
            textTransform: "uppercase",
            transition: "opacity 0.3s ease",
            opacity: visible ? 1 : 0,
            whiteSpace: "nowrap",
          }}
        >
          {phases[idx]}
        </div>
      </div>

      {/* Track 1 — video */}
      <div
        style={{
          height: 32,
          borderRadius: 8,
          background: "rgba(255,255,255,0.05)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div className="tl-shimmer-bg" />
        <div className="tl-playhead-line" />
        {CLIP_BLOCKS_TRACK1.map((b, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: 6,
              left: b.left,
              width: b.w,
              height: 20,
              borderRadius: 4,
              background: i % 2 === 0
                ? "rgba(110,231,255,0.09)"
                : "rgba(176,140,255,0.09)",
            }}
          />
        ))}
      </div>

      {/* Track 2 — audio/captions */}
      <div
        style={{
          height: 20,
          borderRadius: 6,
          background: "rgba(255,255,255,0.04)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div className="tl-shimmer-bg" />
        <div className="tl-playhead-line tl-playhead-line-2" />
        {CLIP_BLOCKS_TRACK2.map((b, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: 5,
              left: b.left,
              width: b.w,
              height: 10,
              borderRadius: 3,
              background: i % 2 === 0
                ? "rgba(110,231,255,0.07)"
                : "rgba(176,140,255,0.07)",
            }}
          />
        ))}
      </div>

      {/* Progress meter */}
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
