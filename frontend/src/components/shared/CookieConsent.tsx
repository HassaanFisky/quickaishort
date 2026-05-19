"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

// ── Isolated warm-cookie palette (never inherits platform dark theme) ──────
const W = {
  bg:          "#fdf6ec",
  bgPanel:     "#fdf0e0",
  border:      "#e8d5b8",
  brown:       "#634647",
  brownHover:  "#ddad81", // spec: hover → warm golden
  tan:         "#ddad81",
  tanLight:    "#f5e6cc",
  text:        "#3f3f46",
  muted:       "#71717a",
  trackOff:    "#d4b896",
  shadow:      "0 32px 64px rgba(99,70,71,0.22), 0 8px 24px rgba(99,70,71,0.12), 0 0 0 1px rgba(99,70,71,0.06)",
} as const;

// ── Cookie SVG with bite mark ──────────────────────────────────────────────
function CookieIcon() {
  return (
    <svg
      width={56}
      height={56}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Ground shadow */}
      <ellipse cx="30" cy="61" rx="19" ry="3" fill="rgba(99,70,71,0.10)" />
      {/* Cookie body */}
      <circle cx="30" cy="32" r="26" fill="#c8956c" />
      {/* Subtle inner highlight */}
      <circle cx="22" cy="22" r="10" fill="rgba(255,255,255,0.07)" />
      {/* Bite mark — cream circle overlapping top-right edge */}
      <circle cx="50" cy="11" r="16" fill="#fdf6ec" />
      {/* Bite crumble dots */}
      <circle cx="41" cy="7"  r="2"   fill="#c8956c" opacity="0.55" />
      <circle cx="46" cy="19" r="1.5" fill="#c8956c" opacity="0.45" />
      <circle cx="36" cy="5"  r="1.2" fill="#c8956c" opacity="0.40" />
      {/* Texture crack lines */}
      <path d="M 24 21 Q 28 27 23 33" stroke="#a67550" strokeWidth="1.1" fill="none" strokeLinecap="round" opacity="0.5" />
      <path d="M 35 28 Q 31 34 35 39" stroke="#a67550" strokeWidth="1.1" fill="none" strokeLinecap="round" opacity="0.5" />
      {/* Chocolate chips */}
      <ellipse cx="19" cy="24" rx="3.5" ry="3"   fill="#634647" />
      <ellipse cx="31" cy="20" rx="3"   ry="2.5" fill="#634647" />
      <ellipse cx="25" cy="36" rx="3.5" ry="3"   fill="#634647" />
      <ellipse cx="38" cy="33" rx="3"   ry="2.5" fill="#634647" />
      <ellipse cx="17" cy="41" rx="2.5" ry="2"   fill="#634647" />
      <ellipse cx="33" cy="45" rx="3.5" ry="3"   fill="#634647" />
      {/* Chip highlights */}
      <ellipse cx="18.2" cy="23" rx="1.1" ry="0.9" fill="#7a5e5f" opacity="0.65" />
      <ellipse cx="30.2" cy="19" rx="0.9" ry="0.7" fill="#7a5e5f" opacity="0.65" />
      <ellipse cx="24.2" cy="35" rx="1.1" ry="0.9" fill="#7a5e5f" opacity="0.65" />
    </svg>
  );
}

// ── Animated toggle switch ─────────────────────────────────────────────────
function Toggle({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: () => void;
  id: string;
}) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        background: checked ? W.brown : W.trackOff,
        border: "none",
        padding: 3,
        cursor: "pointer",
        transition: "background 0.22s ease",
        display: "flex",
        alignItems: "center",
        justifyContent: checked ? "flex-end" : "flex-start",
        flexShrink: 0,
        outline: "none",
      }}
      onFocus={e => (e.currentTarget.style.boxShadow = `0 0 0 2px ${W.tan}`)}
      onBlur={e => (e.currentTarget.style.boxShadow = "none")}
    >
      <motion.span
        layout
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 4px rgba(0,0,0,0.20)",
          display: "block",
        }}
        transition={{ type: "spring", stiffness: 500, damping: 28 }}
      />
    </button>
  );
}

// ── Preference row ─────────────────────────────────────────────────────────
function PrefRow({
  label,
  description,
  checked,
  onChange,
  locked,
  id,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  locked?: boolean;
  id: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "11px 0",
        borderBottom: `1px solid ${W.border}`,
      }}
    >
      <label
        htmlFor={locked ? undefined : id}
        style={{ cursor: locked ? "default" : "pointer", flex: 1, minWidth: 0 }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: W.text,
            marginBottom: 2,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {label}
          {locked && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: W.tan,
                background: "#fdf6ec",
                border: `1px solid ${W.border}`,
                borderRadius: 4,
                padding: "1px 5px",
              }}
            >
              Required
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: W.muted, lineHeight: 1.45 }}>
          {description}
        </div>
      </label>
      {locked ? (
        <div
          style={{
            width: 44,
            height: 24,
            borderRadius: 999,
            background: `${W.brown}55`,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: 3,
          }}
          aria-label="Always enabled"
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#fff",
              opacity: 0.6,
              display: "block",
            }}
          />
        </div>
      ) : (
        <Toggle id={id} checked={checked} onChange={onChange} />
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [prefs, setPrefs] = useState({
    analytics: true,
    marketing: true,
    functional: true,
  });

  useEffect(() => {
    try {
      if (!localStorage.getItem("qs-cookie-consent")) {
        const t = setTimeout(() => setVisible(true), 900);
        return () => clearTimeout(t);
      }
    } catch {
      // localStorage blocked (private browsing, etc.) — don't show
    }
  }, []);

  const persist = (value: string) => {
    try {
      localStorage.setItem("qs-cookie-consent", value);
    } catch {}
    setVisible(false);
  };

  const acceptAll = () =>
    persist(
      JSON.stringify({
        necessary: true,
        analytics: true,
        marketing: true,
        functional: true,
      })
    );

  const acceptNecessary = () =>
    persist(JSON.stringify({ necessary: true, analytics: false, marketing: false, functional: false }));

  const savePrefs = () =>
    persist(JSON.stringify({ necessary: true, ...prefs }));

  const togglePref = (key: keyof typeof prefs) =>
    setPrefs((p) => ({ ...p, [key]: !p[key] }));

  return (
    <AnimatePresence>
      {visible && (
        /* ── Backdrop ── */
        <motion.div
          key="cookie-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) acceptNecessary();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            backgroundColor: "rgba(10, 8, 8, 0.45)",
          }}
        >
          {/* ── Card ── */}
          <motion.div
            key="cookie-card"
            initial={{ opacity: 0, y: 44, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.97 }}
            transition={{ type: "spring", damping: 26, stiffness: 220, mass: 0.8 }}
            role="dialog"
            aria-modal="true"
            aria-label="Cookie consent"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: W.bg,
              borderRadius: 20,
              boxShadow: W.shadow,
              width: "100%",
              maxWidth: 440,
              overflow: "hidden",
              fontFamily:
                "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              color: W.text,
            }}
          >
            {/* Warm gradient top bar */}
            <div
              style={{
                height: 4,
                background: `linear-gradient(90deg, ${W.brown} 0%, ${W.tan} 60%, #f0c080 100%)`,
              }}
            />

            <div style={{ padding: "28px 28px 26px" }}>
              {/* Cookie icon */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    background: `linear-gradient(145deg, ${W.tanLight}, #fffaf3)`,
                    border: `1.5px solid ${W.border}`,
                    borderRadius: "50%",
                    padding: 14,
                    boxShadow: `0 4px 18px rgba(99,70,71,0.14), 0 1px 4px rgba(99,70,71,0.08) inset`,
                  }}
                >
                  <CookieIcon />
                </div>
              </div>

              {/* Title */}
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: W.text,
                  textAlign: "center",
                  margin: "0 0 10px",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.3,
                }}
              >
                Your privacy is important to us
              </h2>

              {/* Body */}
              <p
                style={{
                  fontSize: 14,
                  color: W.muted,
                  textAlign: "center",
                  lineHeight: 1.65,
                  margin: "0 0 8px",
                  fontWeight: 400,
                }}
              >
                We use cookies to keep your session secure, remember your
                preferences, and improve your experience on the platform.
              </p>

              {/* Privacy Policy link */}
              <p style={{ textAlign: "center", margin: "0 0 22px" }}>
                <Link
                  href="/privacy"
                  style={{
                    fontSize: 13,
                    color: W.brown,
                    fontWeight: 600,
                    textDecoration: "underline",
                    textDecorationColor: W.tan,
                    textUnderlineOffset: "3px",
                  }}
                >
                  Read our Privacy Policy →
                </Link>
              </p>

              {/* ── Expandable preferences panel ── */}
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    key="prefs-panel"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    style={{ overflow: "hidden" }}
                  >
                    <div
                      style={{
                        background: W.bgPanel,
                        border: `1px solid ${W.border}`,
                        borderRadius: 12,
                        padding: "2px 14px 2px",
                        marginBottom: 16,
                      }}
                    >
                      <PrefRow
                        id="pref-necessary"
                        label="Necessary"
                        description="Session management and security — always active"
                        checked={true}
                        onChange={() => {}}
                        locked
                      />
                      <PrefRow
                        id="pref-analytics"
                        label="Analytics"
                        description="Help us understand how you use the platform"
                        checked={prefs.analytics}
                        onChange={() => togglePref("analytics")}
                      />
                      <PrefRow
                        id="pref-marketing"
                        label="Marketing"
                        description="Personalised offers and feature announcements"
                        checked={prefs.marketing}
                        onChange={() => togglePref("marketing")}
                      />
                      <PrefRow
                        id="pref-functional"
                        label="Functional"
                        description="AI personalisation and enhanced features"
                        checked={prefs.functional}
                        onChange={() => togglePref("functional")}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Action buttons ── */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Accept All */}
                <button
                  onClick={acceptAll}
                  style={{
                    width: "100%",
                    padding: "13px 20px",
                    borderRadius: 12,
                    background: W.brown,
                    color: "#fff",
                    border: "none",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                    letterSpacing: "0.01em",
                    transition: "background 0.18s ease, color 0.18s ease, transform 0.1s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = W.brownHover;
                    e.currentTarget.style.color = W.brown;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = W.brown;
                    e.currentTarget.style.color = "#fff";
                  }}
                  onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
                  onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                >
                  Accept All Cookies
                </button>

                {/* More Options / Save Preferences */}
                {expanded ? (
                  <button
                    onClick={savePrefs}
                    style={{
                      width: "100%",
                      padding: "12px 20px",
                      borderRadius: 12,
                      background: "transparent",
                      color: W.brown,
                      border: `2px solid ${W.tan}`,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      letterSpacing: "0.01em",
                      transition: "background 0.18s ease, transform 0.1s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = W.tanLight)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
                    onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                  >
                    Save My Preferences
                  </button>
                ) : (
                  <button
                    onClick={() => setExpanded(true)}
                    style={{
                      width: "100%",
                      padding: "12px 20px",
                      borderRadius: 12,
                      background: "transparent",
                      color: W.muted,
                      border: `1.5px solid ${W.border}`,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      letterSpacing: "0.01em",
                      transition: "background 0.18s ease, border-color 0.18s ease, color 0.18s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = W.tanLight;
                      e.currentTarget.style.borderColor = W.tan;
                      e.currentTarget.style.color = W.brown;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.borderColor = W.border;
                      e.currentTarget.style.color = W.muted;
                    }}
                  >
                    More Options
                  </button>
                )}

                {/* Necessary only — subtle text link */}
                <button
                  onClick={acceptNecessary}
                  style={{
                    background: "none",
                    border: "none",
                    color: W.muted,
                    fontSize: 12,
                    cursor: "pointer",
                    padding: "4px 0 2px",
                    letterSpacing: "0.01em",
                    textDecoration: "underline",
                    textDecorationColor: "transparent",
                    transition: "color 0.15s ease, text-decoration-color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = W.text;
                    e.currentTarget.style.textDecorationColor = W.tan;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = W.muted;
                    e.currentTarget.style.textDecorationColor = "transparent";
                  }}
                >
                  Use necessary cookies only
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
