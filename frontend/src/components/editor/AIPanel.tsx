"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useEditorStore } from "@/stores/editorStore";
import { callGeminiEditor, getInitialSuggestions } from "@/lib/gemini-editor";
import { useVoiceInput } from "@/hooks/useVoiceInput";

export function AIPanel() {
  const {
    aiPanelOpen,
    setAIPanelOpen,
    aiMessages,
    addAIMessage,
    isAIThinking,
    setAIThinking,
    dispatchAIActions,
    videoMetadata,
    videoAnalysis,
  } = useEditorStore();

  const [inputText, setInputText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTranscript = useCallback((text: string, isFinal: boolean) => {
    if (isFinal) {
      setInputText((prev) => (prev ? prev + " " + text : text));
      setInterimText("");
    } else {
      setInterimText(text);
    }
  }, []);

  const { isRecording, startRecording, stopRecording, error: voiceError } =
    useVoiceInput(handleTranscript);

  const toggleVoice = () => (isRecording ? stopRecording() : startRecording());

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages, isAIThinking]);

  // Load initial suggestions when video is ready
  useEffect(() => {
    if (!videoMetadata || suggestionsLoaded) return;
    setSuggestionsLoaded(true);

    getInitialSuggestions(videoMetadata, videoAnalysis)
      .then((s) => {
        setSuggestions(s);
      })
      .catch((err: unknown) => {
        console.error("[AIPanel] getInitialSuggestions failed:", err instanceof Error ? err.message : String(err));
        setSuggestions([
          "Add captions from transcript",
          "Trim intro to first scene",
          "Apply cinematic color grade",
          "Boost brightness +20%",
          "Remove intro silence",
        ]);
      })
      .finally(() => {
        addAIMessage({
          role: "assistant",
          content: `Video loaded — **${videoMetadata.title || "Untitled"}** (${Math.round(videoMetadata.duration)}s, ${videoMetadata.nativeWidth}×${videoMetadata.nativeHeight}).\n\nI've analyzed it. Tell me what to edit or tap a suggestion.`,
          actions: [],
        });
      });
  }, [videoMetadata, videoAnalysis, suggestionsLoaded, addAIMessage]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isAIThinking) return;

      stopRecording();
      setInputText("");
      setInterimText("");

      // Snapshot history BEFORE adding the new user message so Gemini doesn't
      // see the current user turn twice (once in history, once via sendMessage).
      const historySnapshot = useEditorStore.getState().aiMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      addAIMessage({ role: "user", content: trimmed });
      setAIThinking(true);

      try {
        const response = await callGeminiEditor(trimmed, videoMetadata, videoAnalysis, historySnapshot);

        if (response.actions.length > 0) {
          dispatchAIActions(response.actions);
        }
        if (response.suggestions.length > 0) {
          setSuggestions(response.suggestions);
        }

        addAIMessage({
          role: "assistant",
          content: response.message || "Done.",
          actions: response.actions,
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[AIPanel] Gemini request failed:", errMsg);

        let displayMsg = "Request failed — please try again.";
        if (/api[_\s]?key|not configured|gemini.*auth|401|403/i.test(errMsg)) {
          displayMsg = "API key error — Gemini is not configured on this server.";
        } else if (/400|invalid argument|alternates/i.test(errMsg)) {
          displayMsg = "Invalid request — try rephrasing your message.";
        } else if (/429|quota|RESOURCE_EXHAUSTED/i.test(errMsg)) {
          displayMsg = "Rate limit reached — wait a moment and try again.";
        } else if (/network|fetch|failed to fetch/i.test(errMsg)) {
          displayMsg = "Network error — check your connection and retry.";
        } else if (/parse|JSON/i.test(errMsg)) {
          displayMsg = "Unexpected response from Gemini — try again.";
        }

        addAIMessage({ role: "assistant", content: displayMsg, actions: [] });
      } finally {
        setAIThinking(false);
      }
    },
    [isAIThinking, stopRecording, addAIMessage, setAIThinking, dispatchAIActions, videoMetadata, videoAnalysis],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText);
    }
  };

  return (
    <AnimatePresence>
      {aiPanelOpen && (
        <motion.aside
          className="ai-panel"
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 260 }}
        >
          <div className="ai-panel-header">
            <div className="ai-header-left">
              <div className="ai-header-gem">✦</div>
              <div className="ai-header-info">
                <span className="ai-panel-brand">QuickAI Short</span>
                <span className="ai-panel-title">Gemini Editor</span>
              </div>
            </div>
            <div className="ai-header-right">
              <span className="ai-header-model">2.5 Flash</span>
              <button
                className="ai-close-btn"
                onClick={() => setAIPanelOpen(false)}
                aria-label="Close AI panel"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="ai-messages">
            {aiMessages.length === 0 && (
              <div className="ai-empty-state">
                <span className="empty-icon">✦</span>
                <p>Load a video and I&apos;ll analyze it.</p>
              </div>
            )}

            {aiMessages.map((msg) => (
              <motion.div
                key={msg.id}
                className={`ai-msg ai-msg-${msg.role}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
              >
                {msg.role === "assistant" && <span className="msg-gem-badge">✦</span>}
                <div className="msg-content">
                  <MessageText text={msg.content} />
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="action-tags">
                      {msg.actions.map((a, i) => (
                        <span key={i} className="action-tag">
                          {a.type.replace(/_/g, " ").toLowerCase()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}

            {isAIThinking && (
              <motion.div
                className="ai-msg ai-msg-assistant"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <span className="msg-gem-badge">✦</span>
                <div className="thinking-dots">
                  <span />
                  <span />
                  <span />
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {suggestions.length > 0 && (
            <div className="suggestions-rail">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  className="suggestion-chip"
                  onClick={() => sendMessage(s)}
                  disabled={isAIThinking}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="ai-input-area">
            {interimText && <div className="interim-text">{interimText}</div>}

            <div className="input-row">
              <textarea
                ref={textareaRef}
                className="ai-textarea"
                placeholder={isRecording ? "Listening..." : "Tell me what to edit..."}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                disabled={isAIThinking}
              />

              <button
                className={`voice-btn ${isRecording ? "voice-btn-active" : ""}`}
                onClick={toggleVoice}
                aria-label={isRecording ? "Stop recording" : "Start voice input"}
                title={isRecording ? "Stop voice" : "Voice input"}
              >
                {isRecording ? (
                  <span className="voice-icon-active">⏹</span>
                ) : (
                  <span className="voice-icon">🎙</span>
                )}
              </button>

              <button
                className="send-btn"
                onClick={() => sendMessage(inputText)}
                disabled={isAIThinking || !inputText.trim()}
                aria-label="Send"
              >
                ↑
              </button>
            </div>

            {voiceError && <p className="voice-error">{voiceError}</p>}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function MessageText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return (
    <p className="msg-text">
      {parts.map((part, i) =>
        part.startsWith("**") ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </p>
  );
}
