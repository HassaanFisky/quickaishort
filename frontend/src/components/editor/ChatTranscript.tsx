"use client";

import { useRef, useEffect } from "react";
import type { AIMessage } from "@/stores/aiPanelStore";

interface ChatTranscriptProps {
  messages: AIMessage[];
  loading: boolean;
  retryText: string | null;
  onRetry: (text: string) => void;
  suggestions: string[];
  onSuggestion: (s: string) => void;
  emptyLabel?: string;
}

export function ChatTranscript({
  messages,
  loading,
  retryText,
  onRetry,
  suggestions,
  onSuggestion,
  emptyLabel,
}: ChatTranscriptProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-foreground/10 [&::-webkit-scrollbar-thumb]:rounded-full">
      {messages.length === 0 && (
        <div className="flex flex-col gap-2">
          {emptyLabel && (
            <p className="text-xs text-muted-foreground text-center px-2 py-3 leading-relaxed">
              {emptyLabel}
            </p>
          )}
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => onSuggestion(s)}
              className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/8 text-fg-muted hover:text-foreground transition-all duration-150"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {messages.map((m, i) => (
        <div
          key={i}
          className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[85%] text-xs px-3 py-2 rounded-xl leading-relaxed ${
              m.role === "user"
                ? "bg-primary text-white"
                : "bg-muted text-foreground"
            }`}
          >
            {m.content}
          </div>
        </div>
      ))}
      {loading && (
        <div className="flex justify-start">
          <div className="bg-muted rounded-xl px-3 py-2">
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce"
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
            onClick={() => onRetry(retryText)}
            className="text-xs px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-all duration-150 font-medium"
          >
            Try again ↺
          </button>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
