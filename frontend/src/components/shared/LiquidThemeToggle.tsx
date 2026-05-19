"use client";

import React from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export function LiquidThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const isDark = (resolvedTheme ?? theme) !== "light";

  const toggle = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <button
      onClick={toggle}
      className={cn(
        "theme-toggle-pill",
        isDark ? "theme-dark" : "theme-light",
      )}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to Pearl (light) theme" : "Switch to Midnight (dark) theme"}
      type="button"
    >
      {/* Stars — visible in dark mode */}
      {isDark && (
        <>
          <span
            className="toggle-star"
            style={{ width: 3, height: 3, top: 7, right: 10, animation: "star-twinkle 1.6s ease infinite" }}
            aria-hidden="true"
          />
          <span
            className="toggle-star"
            style={{ width: 2, height: 2, top: 15, right: 7, animation: "star-twinkle 2.1s ease infinite 0.5s" }}
            aria-hidden="true"
          />
          <span
            className="toggle-star"
            style={{ width: 2, height: 2, top: 23, right: 13, animation: "star-twinkle 1.9s ease infinite 1s" }}
            aria-hidden="true"
          />
        </>
      )}

      {/* Cloud — visible in light mode */}
      {!isDark && (
        <span
          className="toggle-cloud"
          style={{ width: 14, height: 5 }}
          aria-hidden="true"
        >
          <span style={{
            position: "absolute",
            background: "rgba(255,255,255,0.85)",
            borderRadius: "50%",
            width: 8,
            height: 8,
            top: -4,
            left: 3,
          }} />
        </span>
      )}

      {/* Thumb — slides left (light) / right (dark) */}
      <span className="toggle-thumb" aria-hidden="true">
        {/* Moon craters */}
        {isDark && (
          <>
            <span className="moon-dot" style={{ width: 6, height: 6, top: 6, left: 10 }} />
            <span className="moon-dot" style={{ width: 4, height: 4, top: 14, left: 7 }} />
            <span className="moon-dot" style={{ width: 3, height: 3, top: 9, left: 18 }} />
          </>
        )}
      </span>
    </button>
  );
}
