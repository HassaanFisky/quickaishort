'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const KEY = 'qas_cookie_consent_v1';

export function CookieConsent() {
  // 'pending' = not yet mounted (SSR). Never render on server.
  const [phase, setPhase] = useState<'pending' | 'show' | 'hidden'>('pending');

  useEffect(() => {
    // Runs only client-side, after hydration. Safe to read localStorage.
    try {
      const stored = window.localStorage.getItem(KEY);
      setPhase(stored ? 'hidden' : 'show');
    } catch {
      setPhase('show'); // localStorage blocked — show anyway, don't persist
    }
  }, []);

  function accept() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ v: 'accept', ts: Date.now() }));
    } catch { /* ignore */ }
    setPhase('hidden');
  }

  function reject() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ v: 'reject', ts: Date.now() }));
    } catch { /* ignore */ }
    setPhase('hidden');
  }

  // 'pending' renders nothing — avoids SSR/hydration mismatch
  if (phase === 'pending') return null;

  return (
    <AnimatePresence>
      {phase === 'show' && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 28 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999]
                     w-[min(540px,calc(100vw-32px))]
                     rounded-2xl border p-4 sm:p-5
                     bg-[#fdf6ec] text-[#3f3f46]
                     border-[#e8d8c4] shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-label="Cookie consent"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="font-semibold text-sm mb-0.5">Your privacy matters</p>
              <p className="text-xs leading-relaxed text-[#6b6080]">
                We use a small localStorage entry to remember your theme and consent.
                We do not sell or share your data.{' '}
                <a href="/privacy" className="underline hover:opacity-80">
                  Privacy Policy
                </a>
              </p>
            </div>
            <div className="flex gap-2 sm:ml-auto shrink-0">
              <button
                onClick={reject}
                className="px-3 py-1.5 rounded-lg text-sm border border-[#d4c0aa]
                           hover:bg-[#f0e6d8] transition-colors"
              >
                Reject
              </button>
              <button
                onClick={accept}
                className="px-3 py-1.5 rounded-lg text-sm font-medium
                           bg-[#634647] text-white hover:bg-[#7a5657] transition-colors"
              >
                Accept
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
