'use client';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Moon, Sun, Zap } from 'lucide-react';

type AppTheme = 'dark' | 'oled' | 'light';

const CYCLE: AppTheme[] = ['dark', 'oled', 'light'];

function normalizeTheme(theme: string | undefined): AppTheme {
  if (theme === 'oled' || theme === 'light' || theme === 'dark') return theme;
  return 'dark';
}

export function LiquidThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-9 w-9 rounded-lg" />;

  const current = normalizeTheme(theme ?? resolvedTheme);
  const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];

  const label =
    current === 'oled'
      ? 'Switch to light mode'
      : current === 'light'
        ? 'Switch to dark mode'
        : 'Switch to OLED pitch';

  const Icon = current === 'light' ? Sun : current === 'oled' ? Zap : Moon;

  return (
    <button
      type="button"
      aria-label={label}
      title={`Theme: ${current} → ${next}`}
      onClick={() => setTheme(next)}
      className="relative h-9 w-9 rounded-lg bg-[hsl(var(--bg-elevated))]
                 border border-[hsl(var(--border))]
                 overflow-hidden hover:bg-[hsl(var(--bg-muted))]
                 transition-colors focus-visible:outline-none
                 focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent-indigo))]"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={current}
          initial={{ y: -20, opacity: 0, rotate: -45 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: 20, opacity: 0, rotate: 45 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 grid place-items-center text-[hsl(var(--fg))]"
        >
          <Icon size={15} />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
