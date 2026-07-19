'use client';
import { useAIPanel } from '@/stores/aiPanelStore';
import { AnimatePresence, motion } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send } from 'lucide-react';

/** Educational FAQ only — not media-grounded edit advice (EP-003 / A5a). */
const NO_VIDEO_SUGGESTIONS = [
  'What makes a video go viral?',
  'Best aspect ratio for TikTok?',
  'How long should a short be?',
  'What hook works best for AI content?',
];

/** Non-interactive placeholder until MediaGraph backs this surface. */
const WITH_VIDEO_PLACEHOLDER = 'Analyzing media… grounded edit suggestions coming soon';

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
  const suggestions = videoContext ? [WITH_VIDEO_PLACEHOLDER] : NO_VIDEO_SUGGESTIONS;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
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
            videoDuration: videoContext ? 100.0 : 0.0,
            currentTime: 0.0,
            elementCount: 0,
            captionCount: 0,
            captionsEnabled: false,
            aspectRatio: "9:16",
            visualFilter: "None",
            audioBoost: 100.0,
            playbackSpeed: 100.0,
          },
          transcript: videoContext?.transcript
            ? [{ text: videoContext.transcript, start: 0.0, end: 100.0 }]
            : [],
          video_id: videoContext?.id ?? null,
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
      addMessage({ role: 'assistant', content: 'Connection lost — check your internet and try again.' });
      setRetryText(trimmed);
    } finally {
      setLoading(false);
    }
  }

  const panelContent = (
    <>
      {/* Header */}
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
            {videoContext ? 'Video Editor AI' : 'QuickAI Assistant'}
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

      {/* Context indicator */}
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
              Editing:{' '}
              <strong className="text-[hsl(var(--fg))]">
                {videoContext.title.length > 50
                  ? videoContext.title.slice(0, 50) + '…'
                  : videoContext.title}
              </strong>
            </>
          ) : (
            'No video loaded — I can help with ideas and strategy.'
          )}
        </motion.div>
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-[hsl(var(--fg-subtle))] pb-1">
              Quick Actions
            </p>
            {suggestions.map((s) =>
              videoContext ? (
                <div
                  key={s}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg
                             border border-[hsl(var(--border))]
                             text-[hsl(var(--fg-muted))] opacity-70 cursor-default"
                  aria-disabled="true"
                >
                  {s}
                </div>
              ) : (
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
              ),
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

      {/* Input */}
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
          placeholder={videoContext ? 'Ask about this video…' : 'Ask anything…'}
          className="flex-1 text-xs rounded-lg px-3 py-2
                     bg-[hsl(var(--bg-subtle))] border border-[hsl(var(--border))]
                     text-[hsl(var(--fg))] placeholder:text-[hsl(var(--fg-subtle))]
                     focus:outline-none focus:border-[hsl(var(--accent-indigo))]
                     focus:shadow-[0_0_0_2px_hsl(var(--accent-indigo)/0.15)]
                     transition-all"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="px-2.5 py-2 rounded-lg bg-[hsl(var(--accent-indigo))] text-[hsl(var(--accent-fg))]
                     disabled:opacity-40 disabled:cursor-not-allowed
                     hover:bg-[hsl(var(--accent-hover))] transition-colors"
        >
          <Send size={14} />
        </button>
      </form>
    </>
  );

  // Embedded: renders inline in a grid cell — parent AnimatePresence controls visibility.
  if (embedded) {
    return (
      <div className="flex flex-col h-full w-full bg-[hsl(var(--bg-subtle))] overflow-hidden">
        {panelContent}
      </div>
    );
  }

  // Default: fixed overlay sliding in from the right, used on mobile / sm screens.
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
