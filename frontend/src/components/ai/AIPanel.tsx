'use client';
import { useAIPanel } from '@/stores/aiPanelStore';
import { AnimatePresence, motion } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Sparkles, X, Send, ArrowRight } from 'lucide-react';

/**
 * Dashboard FAQ assistant only.
 * Timeline edits live exclusively in `components/editor/AIPanel.tsx` (Studio Kernel path).
 * When a video context is present, route the user to /editor — never fake edit state.
 */

/** Educational FAQ only — not media-grounded edit advice (EP-003 / A5a). */
const NO_VIDEO_SUGGESTIONS = [
  'What makes a video go viral?',
  'Best aspect ratio for TikTok?',
  'How long should a short be?',
  'What hook works best for AI content?',
];

interface AIPanelProps {
  /** When true, renders inline inside a grid cell (no fixed positioning, no AnimatePresence guard). */
  embedded?: boolean;
}

export function AIPanel({ embedded = false }: AIPanelProps) {
  const { isOpen, setOpen, videoContext, messages, addMessage } = useAIPanel();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [retryText, setRetryText] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    // Edit intents belong in the Studio editor (Kernel + MediaGraph).
    if (videoContext) {
      addMessage({ role: 'user', content: trimmed });
      addMessage({
        role: 'assistant',
        content:
          'Timeline edits run in QuickAI Studio Editor — open the editor for grounded suggestions and Kernel-backed commits.',
      });
      setInput('');
      return;
    }

    setInput('');
    setRetryText(null);
    addMessage({ role: 'user', content: trimmed });
    setLoading(true);
    try {
      const res = await fetch('/api/ai/editor', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmed,
          current_state: {
            videoDuration: 0.0,
            currentTime: 0.0,
            elementCount: 0,
            captionCount: 0,
            captionsEnabled: false,
            aspectRatio: '9:16',
            visualFilter: 'None',
            audioBoost: 100.0,
            playbackSpeed: 100.0,
          },
          transcript: [],
          video_id: null,
        }),
      });
      const data = await res.json();

      let content: string;
      if (data.content) {
        content = data.content;
      } else if (res.status === 401) {
        content = 'Sign in to use AI suggestions.';
      } else if (res.status === 503) {
        content = 'AI service not configured — contact support.';
      } else if (res.status === 429) {
        content = 'Rate limit exceeded — try again in a moment.';
      } else if (res.status >= 500) {
        content = `AI error (${res.status}) — please try again.`;
        setRetryText(trimmed);
      } else {
        content = data.message ?? 'Something went wrong.';
      }

      addMessage({ role: 'assistant', content });
    } catch {
      addMessage({
        role: 'assistant',
        content: 'Connection lost — check your internet and try again.',
      });
      setRetryText(trimmed);
    } finally {
      setLoading(false);
    }
  }

  const panelContent = (
    <>
      <header
        className="flex items-center justify-between px-4 py-3
                   border-b border-[hsl(var(--border-strong))]
                   bg-[hsl(var(--bg-elevated))] shrink-0"
      >
        <div className="flex items-center gap-2">
          <span
            className="grid h-6 w-6 place-items-center rounded-md
                       bg-[hsl(var(--accent-indigo))] text-[hsl(var(--accent-fg))]"
          >
            <Sparkles size={12} />
          </span>
          <span className="font-medium text-sm text-[hsl(var(--fg))]">
            {videoContext ? 'Open Studio Editor' : 'QuickAI Assistant'}
          </span>
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close AI panel"
          className="p-1 rounded-md hover:bg-[hsl(var(--bg-muted))] text-[hsl(var(--fg-muted))]"
        >
          <X size={14} />
        </button>
      </header>

      <AnimatePresence mode="wait">
        <motion.div
          key={videoContext ? 'video' : 'general'}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="px-4 py-2.5 text-xs text-[hsl(var(--fg-muted))]
                     border-b border-[hsl(var(--border))] bg-[hsl(var(--bg-subtle))] shrink-0"
        >
          {videoContext ? (
            <>
              Video selected:{' '}
              <strong className="text-[hsl(var(--fg))]">
                {videoContext.title.length > 50
                  ? videoContext.title.slice(0, 50) + '…'
                  : videoContext.title}
              </strong>
              {' — '}edit in Studio Editor.
            </>
          ) : (
            'No video loaded — I can help with ideas and strategy.'
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="space-y-2">
            {videoContext ? (
              <>
                <p className="text-xs uppercase tracking-wider text-[hsl(var(--fg-subtle))] pb-1">
                  Studio
                </p>
                <Link
                  href="/editor"
                  className="flex items-center justify-between gap-2 w-full text-left text-xs px-3 py-2.5 rounded-lg
                             border border-[hsl(var(--accent-indigo)/0.4)]
                             bg-[hsl(var(--accent-soft))] text-[hsl(var(--fg))]
                             hover:border-[hsl(var(--accent-indigo))] transition-all duration-150"
                >
                  <span>Open Editor for grounded edits</span>
                  <ArrowRight size={14} className="shrink-0 opacity-70" />
                </Link>
                <p className="text-[11px] text-[hsl(var(--fg-muted))] leading-relaxed pt-1">
                  Dashboard chat does not mutate timelines. MediaGraph suggestions and Kernel commits run only in the editor.
                </p>
              </>
            ) : (
              <>
                <p className="text-xs uppercase tracking-wider text-[hsl(var(--fg-subtle))] pb-1">
                  Quick Actions
                </p>
                {NO_VIDEO_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg
                               border border-[hsl(var(--border))]
                               hover:border-[hsl(var(--accent-indigo))] hover:bg-[hsl(var(--accent-soft))]
                               text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg))]
                               transition-all duration-150"
                  >
                    {s}
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] text-xs px-3 py-2 rounded-xl leading-relaxed ${
                m.role === 'user'
                  ? 'bg-[hsl(var(--accent-indigo))] text-[hsl(var(--accent-fg))]'
                  : 'bg-[hsl(var(--bg-muted))] text-[hsl(var(--fg))]'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-[hsl(var(--bg-muted))] rounded-xl px-3 py-2">
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--fg-subtle))] animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}

        {retryText && !loading && (
          <div className="flex justify-end">
            <button
              onClick={() => send(retryText)}
              className="text-xs px-3 py-1.5 rounded-lg border border-[hsl(var(--accent-indigo)/0.4)]
                         text-[hsl(var(--accent-indigo))] hover:bg-[hsl(var(--accent-soft))]
                         transition-all duration-150 font-medium"
            >
              Try again ↺
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-[hsl(var(--border))] p-3 flex gap-2 shrink-0"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            videoContext ? 'Open Editor to edit this video…' : 'Ask anything…'
          }
          disabled={Boolean(videoContext)}
          className="flex-1 text-xs rounded-lg px-3 py-2
                     bg-[hsl(var(--bg-subtle))] border border-[hsl(var(--border))]
                     text-[hsl(var(--fg))] placeholder:text-[hsl(var(--fg-subtle))]
                     focus:outline-none focus:border-[hsl(var(--accent-indigo))]
                     focus:shadow-[0_0_0_2px_hsl(var(--accent-indigo)/0.15)]
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all"
        />
        {videoContext ? (
          <Link
            href="/editor"
            className="px-2.5 py-2 rounded-lg bg-[hsl(var(--accent-indigo))] text-[hsl(var(--accent-fg))]
                       hover:bg-[hsl(var(--accent-hover))] transition-colors grid place-items-center"
            aria-label="Open Studio Editor"
          >
            <ArrowRight size={14} />
          </Link>
        ) : (
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="px-2.5 py-2 rounded-lg bg-[hsl(var(--accent-indigo))] text-[hsl(var(--accent-fg))]
                       disabled:opacity-40 disabled:cursor-not-allowed
                       hover:bg-[hsl(var(--accent-hover))] transition-colors"
          >
            <Send size={14} />
          </button>
        )}
      </form>
    </>
  );

  if (embedded) {
    return (
      <div className="flex flex-col h-full w-full bg-[hsl(var(--bg-subtle))] overflow-hidden">
        {panelContent}
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          key="ai-panel"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 220, damping: 30 }}
          className="fixed right-0 top-0 z-40 h-screen w-[340px]
                     bg-[hsl(var(--bg-subtle))] border-l border-[hsl(var(--border-strong))]
                     flex flex-col shadow-2xl"
        >
          {panelContent}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
