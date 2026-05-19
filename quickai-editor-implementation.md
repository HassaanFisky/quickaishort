# QuickAI Short — AI Video Editor: Complete Production Implementation

## Architecture Decision (Zero Server GPU)

```
User Video URL → HTML5 <video> tag (free, browser handles codec)
              → CSS filter property (uses USER's device GPU, not yours)
              → Canvas API (client-side, no cost)
              → Gemini API (text-only JSON generation, pennies per call)
              → Zustand dispatches JSON → React re-renders → done
```

**No FFmpeg on server. No GPU instances. No rendering pipeline.**
The browser IS the renderer. You just orchestrate it with Gemini JSON.

---

## Step 1: Install Dependencies

```bash
npm install zustand immer @google/generative-ai @google-cloud/speech framer-motion
npm install -D @types/google-cloud__speech
```

---

## FILE 1: `store/editorStore.ts`

```typescript
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { subscribeWithSelector } from 'zustand/middleware'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VideoMetadata {
  id: string
  url: string
  title: string
  duration: number
  nativeWidth: number
  nativeHeight: number
  fps: number
}

export interface Caption {
  id: string
  text: string
  startTime: number
  endTime: number
  style: CaptionStyle
}

export interface CaptionStyle {
  fontSize: number
  color: string
  background: string
  position: 'top' | 'middle' | 'bottom'
  bold: boolean
}

export interface FrameFilter {
  brightness: number   // 0.5–2.0, default 1
  contrast: number     // 0.5–2.0, default 1
  saturation: number   // 0–2.0, default 1
  hue: number          // -180 to 180, default 0
  blur: number         // 0–10, default 0
}

export interface TrimMarker {
  startTime: number
  endTime: number
}

export interface AIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  actions?: EditorAction[]
}

export interface EditorAction {
  type:
    | 'ADD_CAPTION'
    | 'REMOVE_CAPTION'
    | 'UPDATE_CAPTION'
    | 'TRIM'
    | 'ADD_FILTER'
    | 'RESET_FILTER'
    | 'SEEK'
    | 'PLAY'
    | 'PAUSE'
  payload: Record<string, any>
}

export interface GeminiResponse {
  actions: EditorAction[]
  message: string
  suggestions: string[]
}

export interface VideoAnalysis {
  scenes: { time: number; description: string }[]
  transcript: { text: string; startTime: number; endTime: number }[]
  topics: string[]
  suggestedEdits: string[]
}

// ─── Default values ───────────────────────────────────────────────────────────

const DEFAULT_FILTERS: FrameFilter = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  blur: 0
}

const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontSize: 20,
  color: '#FFFFFF',
  background: 'rgba(0,0,0,0.6)',
  position: 'bottom',
  bold: false
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface EditorStore {
  // State
  videoMetadata: VideoMetadata | null
  currentTime: number
  isPlaying: boolean
  captions: Caption[]
  trimMarker: TrimMarker | null
  filters: FrameFilter
  aiMessages: AIMessage[]
  isAIThinking: boolean
  aiPanelOpen: boolean
  videoAnalysis: VideoAnalysis | null
  videoElementRef: React.RefObject<HTMLVideoElement> | null

  // Setters
  setVideoMetadata: (meta: VideoMetadata) => void
  setCurrentTime: (t: number) => void
  setIsPlaying: (v: boolean) => void
  setTrimMarker: (m: TrimMarker | null) => void
  setFilter: (patch: Partial<FrameFilter>) => void
  resetFilters: () => void
  addCaption: (c: Omit<Caption, 'id' | 'style'> & { style?: Partial<CaptionStyle> }) => string
  removeCaption: (id: string) => void
  updateCaption: (id: string, patch: Partial<Caption>) => void
  addAIMessage: (msg: Omit<AIMessage, 'id' | 'timestamp'>) => void
  setAIThinking: (v: boolean) => void
  setAIPanelOpen: (v: boolean) => void
  setVideoAnalysis: (a: VideoAnalysis) => void
  setVideoElementRef: (ref: React.RefObject<HTMLVideoElement>) => void

  // Core AI dispatcher
  dispatchAIActions: (actions: EditorAction[]) => void
}

export const useEditorStore = create<EditorStore>()(
  subscribeWithSelector(
    immer((set, get) => ({
      videoMetadata: null,
      currentTime: 0,
      isPlaying: false,
      captions: [],
      trimMarker: null,
      filters: DEFAULT_FILTERS,
      aiMessages: [],
      isAIThinking: false,
      aiPanelOpen: false,
      videoAnalysis: null,
      videoElementRef: null,

      setVideoMetadata: (meta) => set((s) => { s.videoMetadata = meta }),
      setCurrentTime: (t) => set((s) => { s.currentTime = t }),
      setIsPlaying: (v) => set((s) => { s.isPlaying = v }),
      setTrimMarker: (m) => set((s) => { s.trimMarker = m }),

      setFilter: (patch) =>
        set((s) => { Object.assign(s.filters, patch) }),

      resetFilters: () =>
        set((s) => { s.filters = DEFAULT_FILTERS }),

      addCaption: (c) => {
        const id = crypto.randomUUID()
        set((s) => {
          s.captions.push({
            id,
            text: c.text,
            startTime: c.startTime,
            endTime: c.endTime,
            style: { ...DEFAULT_CAPTION_STYLE, ...(c.style || {}) }
          })
          s.captions.sort((a, b) => a.startTime - b.startTime)
        })
        return id
      },

      removeCaption: (id) =>
        set((s) => { s.captions = s.captions.filter((c) => c.id !== id) }),

      updateCaption: (id, patch) =>
        set((s) => {
          const idx = s.captions.findIndex((c) => c.id === id)
          if (idx !== -1) Object.assign(s.captions[idx], patch)
        }),

      addAIMessage: (msg) =>
        set((s) => {
          s.aiMessages.push({ id: crypto.randomUUID(), timestamp: Date.now(), ...msg })
        }),

      setAIThinking: (v) => set((s) => { s.isAIThinking = v }),
      setAIPanelOpen: (v) => set((s) => { s.aiPanelOpen = v }),
      setVideoAnalysis: (a) => set((s) => { s.videoAnalysis = a }),
      setVideoElementRef: (ref) => set((s) => { s.videoElementRef = ref }),

      // ─── The core dispatcher ───────────────────────────────────────────────
      dispatchAIActions: (actions) => {
        const store = get()
        const videoEl = store.videoElementRef?.current

        actions.forEach((action) => {
          switch (action.type) {
            case 'ADD_CAPTION':
              store.addCaption({
                text: action.payload.text,
                startTime: action.payload.startTime,
                endTime: action.payload.endTime,
                style: action.payload.style
              })
              break

            case 'REMOVE_CAPTION':
              store.removeCaption(action.payload.id)
              break

            case 'UPDATE_CAPTION':
              store.updateCaption(action.payload.id, action.payload.patch)
              break

            case 'TRIM':
              store.setTrimMarker({
                startTime: action.payload.start,
                endTime: action.payload.end
              })
              if (videoEl) videoEl.currentTime = action.payload.start
              break

            case 'ADD_FILTER':
              store.setFilter({ [action.payload.filter]: action.payload.value })
              break

            case 'RESET_FILTER':
              store.resetFilters()
              break

            case 'SEEK':
              if (videoEl) videoEl.currentTime = action.payload.time
              break

            case 'PLAY':
              videoEl?.play()
              break

            case 'PAUSE':
              videoEl?.pause()
              break
          }
        })
      }
    }))
  )
)
```

---

## FILE 2: `lib/gemini-editor.ts`

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { GeminiResponse, VideoAnalysis, VideoMetadata } from '@/store/editorStore'

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY!)

// ─── System Prompt ────────────────────────────────────────────────────────────
// Direct, no-fluff. Returns only JSON. No acknowledgments.

export const EDITOR_SYSTEM_PROMPT = `You are a video editing state compiler for QuickAI Short.

ROLE: Convert user editing instructions into JSON action arrays. You are not a chatbot. You do not explain yourself. You execute.

ALWAYS respond with ONLY this JSON structure — nothing else, no markdown fences:
{
  "actions": [],
  "message": "string (max 12 words, past tense, action-confirming only)",
  "suggestions": ["string", "string", "string"]
}

ACTION TYPES (use exact type strings):
ADD_CAPTION:    { type: "ADD_CAPTION", payload: { text, startTime, endTime, style?: { fontSize, color, background, position:"top"|"middle"|"bottom", bold } } }
REMOVE_CAPTION: { type: "REMOVE_CAPTION", payload: { id } }
UPDATE_CAPTION: { type: "UPDATE_CAPTION", payload: { id, patch: { text?, startTime?, endTime?, style? } } }
TRIM:           { type: "TRIM", payload: { start, end } }
ADD_FILTER:     { type: "ADD_FILTER", payload: { filter: "brightness"|"contrast"|"saturation"|"hue"|"blur", value: number } }
RESET_FILTER:   { type: "RESET_FILTER", payload: {} }
SEEK:           { type: "SEEK", payload: { time: number (seconds) } }
PLAY:           { type: "PLAY", payload: {} }
PAUSE:          { type: "PAUSE", payload: {} }

FILTER RANGES: brightness 0.5-2.0, contrast 0.5-2.0, saturation 0-2.0, hue -180 to 180, blur 0-10

RULES:
1. Generate captions from transcript when user says "add captions" or "subtitle this"
2. For "trim intro" — use first scene break as end point for trimming start
3. For "make it brighter" — ADD_FILTER brightness 1.4
4. For "cinematic" — ADD_FILTER contrast 1.2, saturation 0.85, brightness 0.95
5. For "vibrant" — ADD_FILTER saturation 1.6, brightness 1.05
6. For "vintage" — ADD_FILTER saturation 0.6, hue 15, brightness 0.9
7. message field: factual, max 12 words. Example: "Added 8 captions from transcript."
8. suggestions: 3 concrete next actions relevant to THIS video content
9. If user asks something outside your action scope: return empty actions array, message explaining limitation in 12 words
10. NEVER output anything except the JSON object`

// ─── Call Gemini Editor ───────────────────────────────────────────────────────

export async function callGeminiEditor(
  userMessage: string,
  videoMetadata: VideoMetadata | null,
  videoAnalysis: VideoAnalysis | null,
  history: { role: string; content: string }[]
): Promise<GeminiResponse> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  })

  const videoContext = buildVideoContext(videoMetadata, videoAnalysis)

  // Build history for chat (last 10 turns max)
  const chatHistory = history.slice(-10).map((m) => ({
    role: m.role === 'user' ? 'user' : ('model' as const),
    parts: [{ text: m.content }]
  }))

  const chat = model.startChat({
    history: [
      {
        role: 'user',
        parts: [{ text: EDITOR_SYSTEM_PROMPT + '\n\nVIDEO DATA:\n' + videoContext }]
      },
      {
        role: 'model',
        parts: [
          {
            text: JSON.stringify({
              actions: [],
              message: 'Ready. Video loaded and analyzed.',
              suggestions: videoAnalysis?.suggestedEdits?.slice(0, 3) || [
                'Add auto-captions from transcript',
                'Trim intro to first scene break',
                'Apply cinematic color grade'
              ]
            })
          }
        ]
      },
      ...chatHistory
    ]
  })

  const result = await chat.sendMessage(userMessage)
  const text = result.response.text().trim()

  try {
    const cleaned = text.replace(/^```json\n?|\n?```$/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return {
      actions: [],
      message: 'Could not parse response. Please try again.',
      suggestions: []
    }
  }
}

// ─── Initial video analysis prompt ───────────────────────────────────────────

export async function getInitialSuggestions(
  videoMetadata: VideoMetadata,
  videoAnalysis: VideoAnalysis | null
): Promise<string[]> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
  })

  const prompt = `Video title: "${videoMetadata.title}"
Duration: ${Math.round(videoMetadata.duration)}s
Topics: ${videoAnalysis?.topics?.join(', ') || 'unknown'}
Scene count: ${videoAnalysis?.scenes?.length || 'unknown'}
Transcript available: ${videoAnalysis && videoAnalysis.transcript.length > 0 ? 'yes' : 'no'}

Return ONLY JSON: { "suggestions": ["action1", "action2", "action3", "action4", "action5"] }
Make suggestions specific to this video. Format: imperative verb + specific detail.
Examples: "Add captions to first 30 seconds", "Trim intro to 0:05", "Apply warm color grade for lifestyle content"`

  const result = await model.generateContent(prompt)
  const text = result.response.text()

  try {
    const cleaned = text.replace(/^```json\n?|\n?```$/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return parsed.suggestions || []
  } catch {
    return [
      'Add captions from transcript',
      'Trim to highlight best moments',
      'Apply cinematic color grade',
      'Boost brightness +20%',
      'Remove intro silence'
    ]
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildVideoContext(
  meta: VideoMetadata | null,
  analysis: VideoAnalysis | null
): string {
  if (!meta) return 'No video loaded.'

  const parts = [
    `Title: ${meta.title}`,
    `Duration: ${meta.duration}s`,
    `Dimensions: ${meta.nativeWidth}x${meta.nativeHeight}`
  ]

  if (analysis) {
    if (analysis.scenes.length > 0) {
      parts.push(`Scenes: ${JSON.stringify(analysis.scenes.slice(0, 15))}`)
    }
    if (analysis.transcript.length > 0) {
      // Include first 25 transcript segments for caption generation
      parts.push(`Transcript: ${JSON.stringify(analysis.transcript.slice(0, 25))}`)
    }
    if (analysis.topics.length > 0) {
      parts.push(`Topics: ${analysis.topics.join(', ')}`)
    }
  }

  return parts.join('\n')
}
```

---

## FILE 3: `hooks/useVoiceInput.ts`

```typescript
import { useState, useRef, useCallback, useEffect } from 'react'

type TranscriptCallback = (text: string, isFinal: boolean) => void

export function useVoiceInput(onTranscript: TranscriptCallback) {
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<any>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)

  const startRecording = useCallback(async () => {
    setError(null)

    // ── Priority 1: Web Speech API (free, works in Chrome/Edge) ──────────────
    const SpeechAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (SpeechAPI) {
      const recognition = new SpeechAPI()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'
      recognition.maxAlternatives = 1

      recognition.onresult = (e: SpeechRecognitionEvent) => {
        let interimText = ''
        let finalText = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript
          if (e.results[i].isFinal) finalText += t
          else interimText += t
        }
        if (finalText) onTranscript(finalText, true)
        else if (interimText) onTranscript(interimText, false)
      }

      recognition.onerror = (e: any) => {
        setError(e.error === 'not-allowed' ? 'Mic permission denied' : `Error: ${e.error}`)
        setIsRecording(false)
      }

      recognition.onend = () => {
        // Auto-restart if still in recording state (handles browser auto-stop)
        if (recognitionRef.current) recognition.start()
      }

      recognition.start()
      recognitionRef.current = recognition
      setIsRecording(true)
      return
    }

    // ── Fallback: MediaRecorder → GCloud STT backend ──────────────────────────
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm'
      })

      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks, { type: 'audio/webm' })
        const fd = new FormData()
        fd.append('audio', blob, 'voice.webm')

        try {
          const res = await fetch('/api/speech-to-text', { method: 'POST', body: fd })
          const data = await res.json()
          if (data.transcript) onTranscript(data.transcript, true)
          else if (data.error) setError(data.error)
        } catch {
          setError('Transcription failed')
        }
      }

      recorder.start(250) // collect chunks every 250ms
      mediaRecorderRef.current = recorder
      setIsRecording(true)
    } catch {
      setError('Microphone access denied')
    }
  }, [onTranscript])

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null // prevent auto-restart
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
    setIsRecording(false)
  }, [])

  // Cleanup on unmount
  useEffect(() => () => stopRecording(), [stopRecording])

  return { isRecording, startRecording, stopRecording, error }
}
```

---

## FILE 4: `lib/captionEngine.ts`

```typescript
import type { Caption } from '@/store/editorStore'

// Binary search — O(log n) — safe to call every animation frame at 60fps
export function findActiveCaption(
  captions: Caption[],
  currentTime: number
): Caption | null {
  if (captions.length === 0) return null

  let low = 0
  let high = captions.length - 1

  while (low <= high) {
    const mid = (low + high) >>> 1
    const cap = captions[mid]

    if (currentTime >= cap.startTime && currentTime <= cap.endTime) {
      return cap
    }
    if (currentTime < cap.startTime) {
      high = mid - 1
    } else {
      low = mid + 1
    }
  }

  return null
}

// Build CSS filter string from FrameFilter object
export function buildCSSFilter(filters: {
  brightness: number
  contrast: number
  saturation: number
  hue: number
  blur: number
}): string {
  const parts: string[] = []
  if (filters.brightness !== 1) parts.push(`brightness(${filters.brightness})`)
  if (filters.contrast !== 1) parts.push(`contrast(${filters.contrast})`)
  if (filters.saturation !== 1) parts.push(`saturate(${filters.saturation})`)
  if (filters.hue !== 0) parts.push(`hue-rotate(${filters.hue}deg)`)
  if (filters.blur !== 0) parts.push(`blur(${filters.blur}px)`)
  return parts.length > 0 ? parts.join(' ') : 'none'
}

// Detect native aspect ratio bucket
export function detectAspectRatio(width: number, height: number): string {
  if (width === 0 || height === 0) return '16 / 9'
  const ratio = width / height
  // 16:9 = 1.777, 9:16 = 0.5625, 1:1 = 1.0
  // Use 5% tolerance
  if (Math.abs(ratio - 16 / 9) < 0.1) return '16 / 9'
  if (Math.abs(ratio - 9 / 16) < 0.05) return '9 / 16'
  if (Math.abs(ratio - 1) < 0.05) return '1 / 1'
  if (Math.abs(ratio - 4 / 3) < 0.1) return '4 / 3'
  // Return exact ratio for anything else
  return `${width} / ${height}`
}
```

---

## FILE 5: `components/editor/VideoEditorPage.tsx`

```tsx
'use client'

import React, { useRef, useEffect, useCallback, useState } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { findActiveCaption, buildCSSFilter, detectAspectRatio } from '@/lib/captionEngine'
import { AIPanel } from './AIPanel'
import { FilterControls } from './FilterControls'
import { motion, AnimatePresence } from 'framer-motion'

// ─── Props ────────────────────────────────────────────────────────────────────

interface VideoEditorPageProps {
  videoUrl: string
  videoTitle: string
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function VideoEditorPage({ videoUrl, videoTitle }: VideoEditorPageProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const animFrameRef = useRef<number>(0)

  const {
    videoMetadata,
    setVideoMetadata,
    setCurrentTime,
    setIsPlaying,
    setVideoElementRef,
    captions,
    filters,
    trimMarker,
    aiPanelOpen,
    setAIPanelOpen,
    isPlaying
  } = useEditorStore()

  const [activeCaption, setActiveCaption] = useState<string | null>(null)

  // Register video ref in store (for AI dispatcher SEEK/PLAY/PAUSE)
  useEffect(() => {
    setVideoElementRef(videoRef)
  }, [setVideoElementRef])

  // ─── 60fps caption tracking loop ─────────────────────────────────────────
  const trackLoop = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    const t = video.currentTime
    setCurrentTime(t)

    const cap = findActiveCaption(captions, t)
    setActiveCaption(cap?.text ?? null)

    // Enforce trim bounds
    if (trimMarker) {
      if (t < trimMarker.startTime) {
        video.currentTime = trimMarker.startTime
      } else if (t > trimMarker.endTime) {
        video.pause()
        video.currentTime = trimMarker.startTime
      }
    }

    animFrameRef.current = requestAnimationFrame(trackLoop)
  }, [captions, trimMarker, setCurrentTime])

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(trackLoop)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [trackLoop])

  // ─── Video metadata on load ───────────────────────────────────────────────
  const handleLoadedMetadata = () => {
    const video = videoRef.current
    if (!video) return
    setVideoMetadata({
      id: crypto.randomUUID(),
      url: videoUrl,
      title: videoTitle,
      duration: video.duration,
      nativeWidth: video.videoWidth,
      nativeHeight: video.videoHeight,
      fps: 30
    })
  }

  // ─── Dynamic aspect ratio ─────────────────────────────────────────────────
  const aspectRatio = videoMetadata
    ? detectAspectRatio(videoMetadata.nativeWidth, videoMetadata.nativeHeight)
    : '16 / 9'

  // Wide or narrow? Determines container sizing strategy
  const isPortrait = videoMetadata
    ? videoMetadata.nativeHeight > videoMetadata.nativeWidth
    : false

  const filterString = buildCSSFilter(filters)

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="editor-root">
      {/* ── Video area ────────────────────────────────────────────────────── */}
      <div className={`video-stage ${isPortrait ? 'stage-portrait' : 'stage-landscape'}`}>
        <div
          className="video-wrapper"
          style={{ aspectRatio }}
        >
          {/* Video */}
          <video
            ref={videoRef}
            src={videoUrl}
            className="video-element"
            style={{ filter: filterString }}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            controls={false}
            playsInline
            crossOrigin="anonymous"
          />

          {/* Caption overlay */}
          <AnimatePresence mode="wait">
            {activeCaption && (
              <motion.div
                key={activeCaption}
                className="caption-overlay"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                <span className="caption-text">{activeCaption}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Trim indicator */}
          {trimMarker && (
            <div className="trim-badge">
              ✂ {trimMarker.startTime.toFixed(1)}s — {trimMarker.endTime.toFixed(1)}s
            </div>
          )}
        </div>

        {/* ── Video controls ──────────────────────────────────────────────── */}
        <VideoControls videoRef={videoRef} />
      </div>

      {/* ── Filter controls sidebar ───────────────────────────────────────── */}
      <FilterControls />

      {/* ── AI Panel toggle button ────────────────────────────────────────── */}
      <button
        className="ai-panel-toggle"
        onClick={() => setAIPanelOpen(!aiPanelOpen)}
        aria-label="Toggle AI Editor"
      >
        <span className="ai-toggle-icon">✦</span>
        <span className="ai-toggle-label">AI Edit</span>
      </button>

      {/* ── AI Panel drawer ───────────────────────────────────────────────── */}
      <AIPanel />
    </div>
  )
}

// ─── Video Controls ───────────────────────────────────────────────────────────

function VideoControls({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement> }) {
  const { currentTime, isPlaying, videoMetadata } = useEditorStore()
  const duration = videoMetadata?.duration || 1

  const toggle = () => {
    const v = videoRef.current
    if (!v) return
    isPlaying ? v.pause() : v.play()
  }

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = parseFloat(e.target.value)
  }

  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="video-controls">
      <button className="ctrl-btn play-btn" onClick={toggle}>
        {isPlaying ? '⏸' : '▶'}
      </button>

      <div className="seek-track">
        <input
          type="range"
          min={0}
          max={duration}
          step={0.05}
          value={currentTime}
          onChange={seek}
          className="seek-slider"
        />
      </div>

      <span className="time-display">
        {fmt(currentTime)} / {fmt(duration)}
      </span>
    </div>
  )
}
```

---

## FILE 6: `components/editor/AIPanel.tsx`

```tsx
'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useEditorStore } from '@/store/editorStore'
import { callGeminiEditor, getInitialSuggestions } from '@/lib/gemini-editor'
import { useVoiceInput } from '@/hooks/useVoiceInput'

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
    setVideoAnalysis
  } = useEditorStore()

  const [inputText, setInputText] = useState('')
  const [interimText, setInterimText] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ─── Voice input ─────────────────────────────────────────────────────────

  const handleTranscript = useCallback((text: string, isFinal: boolean) => {
    if (isFinal) {
      setInputText((prev) => (prev ? prev + ' ' + text : text))
      setInterimText('')
    } else {
      setInterimText(text)
    }
  }, [])

  const { isRecording, startRecording, stopRecording, error: voiceError } =
    useVoiceInput(handleTranscript)

  const toggleVoice = () => (isRecording ? stopRecording() : startRecording())

  // ─── Auto-scroll ──────────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiMessages, isAIThinking])

  // ─── Load initial suggestions when video is ready ─────────────────────────

  useEffect(() => {
    if (!videoMetadata || suggestionsLoaded) return

    setSuggestionsLoaded(true)
    getInitialSuggestions(videoMetadata, videoAnalysis).then((s) => {
      setSuggestions(s)

      // Auto-greeting message from AI
      addAIMessage({
        role: 'assistant',
        content: `Video loaded — **${videoMetadata.title || 'Untitled'}** (${Math.round(videoMetadata.duration)}s, ${videoMetadata.nativeWidth}×${videoMetadata.nativeHeight}).\n\nI've analyzed it. Tell me what to edit or tap a suggestion.`,
        actions: []
      })
    })
  }, [videoMetadata, videoAnalysis, suggestionsLoaded, addAIMessage])

  // ─── Send message ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isAIThinking) return

      stopRecording()
      setInputText('')
      setInterimText('')

      // Add user message
      addAIMessage({ role: 'user', content: trimmed })
      setAIThinking(true)

      // Build conversation history for Gemini
      const history = useEditorStore.getState().aiMessages.map((m) => ({
        role: m.role,
        content: m.content
      }))

      try {
        const response = await callGeminiEditor(
          trimmed,
          videoMetadata,
          videoAnalysis,
          history
        )

        // Execute actions immediately
        if (response.actions.length > 0) {
          dispatchAIActions(response.actions)
        }

        // Update suggestions
        if (response.suggestions.length > 0) {
          setSuggestions(response.suggestions)
        }

        // Add assistant message with action summary
        addAIMessage({
          role: 'assistant',
          content: response.message || 'Done.',
          actions: response.actions
        })
      } catch (err) {
        addAIMessage({
          role: 'assistant',
          content: 'Something went wrong. Try again.',
          actions: []
        })
      } finally {
        setAIThinking(false)
      }
    },
    [
      isAIThinking,
      stopRecording,
      addAIMessage,
      setAIThinking,
      dispatchAIActions,
      videoMetadata,
      videoAnalysis
    ]
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(inputText)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {aiPanelOpen && (
        <motion.aside
          className="ai-panel"
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        >
          {/* Header */}
          <div className="ai-panel-header">
            <div className="ai-header-left">
              <span className="ai-gem-icon">✦</span>
              <span className="ai-panel-title">Gemini Editor</span>
            </div>
            <button
              className="ai-close-btn"
              onClick={() => setAIPanelOpen(false)}
              aria-label="Close AI panel"
            >
              ✕
            </button>
          </div>

          {/* Suggestions chips */}
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

          {/* Messages */}
          <div className="ai-messages">
            {aiMessages.length === 0 && (
              <div className="ai-empty-state">
                <span className="empty-icon">✦</span>
                <p>Load a video and I'll analyze it.</p>
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
                {msg.role === 'assistant' && (
                  <span className="msg-gem-badge">✦</span>
                )}
                <div className="msg-content">
                  <MessageText text={msg.content} />
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="action-tags">
                      {msg.actions.map((a, i) => (
                        <span key={i} className="action-tag">
                          {a.type.replace(/_/g, ' ').toLowerCase()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}

            {/* Typing indicator */}
            {isAIThinking && (
              <motion.div
                className="ai-msg ai-msg-assistant"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <span className="msg-gem-badge">✦</span>
                <div className="thinking-dots">
                  <span /><span /><span />
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="ai-input-area">
            {/* Interim transcript overlay */}
            {interimText && (
              <div className="interim-text">{interimText}</div>
            )}

            <div className="input-row">
              <textarea
                ref={textareaRef}
                className="ai-textarea"
                placeholder={
                  isRecording
                    ? 'Listening...'
                    : 'Tell me what to edit...'
                }
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                disabled={isAIThinking}
              />

              {/* Voice button — always visible */}
              <button
                className={`voice-btn ${isRecording ? 'voice-btn-active' : ''}`}
                onClick={toggleVoice}
                aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
                title={isRecording ? 'Stop voice' : 'Voice input'}
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

            {voiceError && (
              <p className="voice-error">{voiceError}</p>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

// Simple markdown bold renderer (no extra deps)
function MessageText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return (
    <p className="msg-text">
      {parts.map((part, i) =>
        part.startsWith('**') ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </p>
  )
}
```

---

## FILE 7: `components/editor/FilterControls.tsx`

```tsx
'use client'

import React from 'react'
import { useEditorStore } from '@/store/editorStore'

const FILTERS = [
  { key: 'brightness' as const, label: 'Bright', min: 0.5, max: 2, step: 0.05, default: 1 },
  { key: 'contrast' as const,   label: 'Contrast', min: 0.5, max: 2, step: 0.05, default: 1 },
  { key: 'saturation' as const, label: 'Color',   min: 0, max: 2, step: 0.05, default: 1 },
  { key: 'hue' as const,        label: 'Hue',     min: -180, max: 180, step: 1, default: 0 },
  { key: 'blur' as const,       label: 'Blur',    min: 0, max: 10, step: 0.1, default: 0 }
]

export function FilterControls() {
  const { filters, setFilter, resetFilters } = useEditorStore()

  return (
    <div className="filter-controls">
      <div className="filter-header">
        <span className="filter-title">Adjustments</span>
        <button className="filter-reset" onClick={resetFilters}>Reset</button>
      </div>
      {FILTERS.map((f) => (
        <div key={f.key} className="filter-row">
          <label className="filter-label">{f.label}</label>
          <input
            type="range"
            min={f.min}
            max={f.max}
            step={f.step}
            value={filters[f.key]}
            onChange={(e) => setFilter({ [f.key]: parseFloat(e.target.value) })}
            className="filter-slider"
          />
          <span className="filter-value">
            {f.key === 'hue'
              ? `${filters[f.key]}°`
              : filters[f.key].toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  )
}
```

---

## FILE 8: `app/api/speech-to-text/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { SpeechClient } from '@google-cloud/speech'

const speechClient = new SpeechClient({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL!,
    private_key: process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n')
  },
  projectId: process.env.GOOGLE_PROJECT_ID!
})

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audioFile = formData.get('audio') as File | null

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
    }

    const arrayBuffer = await audioFile.arrayBuffer()
    const audioBytes = Buffer.from(arrayBuffer).toString('base64')

    const [response] = await speechClient.recognize({
      audio: { content: audioBytes },
      config: {
        encoding: 'WEBM_OPUS' as any,
        sampleRateHertz: 48000,
        languageCode: 'en-US',
        enableWordTimeOffsets: false,
        enableAutomaticPunctuation: true,
        model: 'latest_short'
      }
    })

    const transcript =
      response.results
        ?.map((r) => r.alternatives?.[0]?.transcript ?? '')
        .filter(Boolean)
        .join(' ')
        .trim() ?? ''

    return NextResponse.json({ transcript })
  } catch (error: any) {
    console.error('STT error:', error)
    return NextResponse.json(
      { error: 'Speech recognition failed', detail: error.message },
      { status: 500 }
    )
  }
}
```

---

## FILE 9: `app/api/analyze-video/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { Storage } from '@google-cloud/storage'
import { VideoIntelligenceServiceClient, protos } from '@google-cloud/video-intelligence'
import { analyzeVideoWithGemini } from '@/lib/gemini-editor'

const storage = new Storage({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL!,
    private_key: process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n')
  },
  projectId: process.env.GOOGLE_PROJECT_ID!
})

const videoClient = new VideoIntelligenceServiceClient({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL!,
    private_key: process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n')
  }
})

export async function POST(req: NextRequest) {
  const { gcsUri, videoUrl, videoTitle } = await req.json()

  // ── Path A: GCS URI provided (for uploaded videos) ─────────────────────────
  if (gcsUri) {
    try {
      const [operation] = await videoClient.annotateVideo({
        inputUri: gcsUri,
        features: [
          protos.google.cloud.videointelligence.v1.Feature.SHOT_CHANGE_DETECTION,
          protos.google.cloud.videointelligence.v1.Feature.SPEECH_TRANSCRIPTION,
          protos.google.cloud.videointelligence.v1.Feature.LABEL_DETECTION
        ],
        videoContext: {
          speechTranscriptionConfig: {
            languageCode: 'en-US',
            enableAutomaticPunctuation: true
          }
        }
      })

      const [result] = await operation.promise()
      const ann = result.annotationResults?.[0]

      const scenes =
        ann?.shotAnnotations?.map((shot) => ({
          time: Number(shot.startTimeOffset?.seconds ?? 0),
          description: 'Scene change'
        })) ?? []

      const transcript =
        ann?.speechTranscriptions?.flatMap((t) => {
          const words = t.alternatives?.[0]?.words ?? []
          // Group into sentence-level segments (every 8 words)
          const segments: { text: string; startTime: number; endTime: number }[] = []
          for (let i = 0; i < words.length; i += 8) {
            const chunk = words.slice(i, i + 8)
            segments.push({
              text: chunk.map((w) => w.word).join(' '),
              startTime: Number(chunk[0]?.startTime?.seconds ?? 0),
              endTime: Number(chunk[chunk.length - 1]?.endTime?.seconds ?? 0)
            })
          }
          return segments
        }) ?? []

      const topics =
        ann?.segmentLabelAnnotations
          ?.map((l) => l.entity?.description ?? '')
          .filter(Boolean)
          .slice(0, 10) ?? []

      return NextResponse.json({ scenes, transcript, topics, suggestedEdits: [] })
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
  }

  // ── Path B: No GCS URI — use Gemini for lightweight metadata analysis ───────
  if (videoUrl && videoTitle) {
    try {
      const result = await analyzeVideoWithGemini(videoUrl, videoTitle)
      return NextResponse.json({
        scenes: [],
        transcript: [],
        topics: result.topics,
        suggestedEdits: result.suggestedEdits
      })
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Provide gcsUri or videoUrl+videoTitle' }, { status: 400 })
}
```

---

## FILE 10: `styles/editor.css`

```css
/* ─── Zoom resilience ─────────────────────────────────────────────────────── */
/* This does NOT prevent browser zoom — it ensures layout SURVIVES zoom cleanly */

html {
  font-size: 16px;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
  scroll-behavior: smooth;
}

*, *::before, *::after {
  box-sizing: border-box;
}

/* ─── Editor root layout ─────────────────────────────────────────────────── */

.editor-root {
  display: grid;
  grid-template-columns: 1fr 14rem;
  grid-template-rows: 1fr auto;
  width: 100%;
  min-height: 100vh;
  background: #0a0a0b;
  color: #e8e8ea;
  font-family: 'DM Sans', 'Sora', system-ui, sans-serif;
  position: relative;
  overflow: hidden;
}

/* ─── Video stage ─────────────────────────────────────────────────────────── */

.video-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: clamp(1rem, 3vw, 2.5rem);
  gap: 1rem;
  min-height: 0;
}

.stage-portrait {
  /* For 9:16 — constrain width, let height breathe */
  max-width: 420px;
  margin: 0 auto;
}

.stage-landscape {
  width: 100%;
}

/* ─── Video wrapper — dynamic aspect ratio ────────────────────────────────── */

.video-wrapper {
  position: relative;
  width: 100%;
  max-height: calc(100vh - 120px); /* Never overflow the screen */
  overflow: hidden;
  border-radius: 0.75rem;
  background: #111113;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.06),
    0 24px 60px rgba(0,0,0,0.7);
}

/* For portrait: constrain width instead of height */
.stage-portrait .video-wrapper {
  width: auto;
  height: calc(100vh - 120px);
}

.video-element {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  transition: filter 0.2s ease;
}

/* ─── Caption overlay ────────────────────────────────────────────────────── */

.caption-overlay {
  position: absolute;
  bottom: 8%;
  left: 50%;
  transform: translateX(-50%);
  width: 88%;
  text-align: center;
  pointer-events: none;
  z-index: 10;
}

.caption-text {
  display: inline-block;
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  font-size: clamp(0.85rem, 2vw, 1.15rem);
  font-weight: 500;
  padding: 0.3em 0.75em;
  border-radius: 0.375rem;
  line-height: 1.5;
  letter-spacing: 0.01em;
  backdrop-filter: blur(4px);
}

/* ─── Trim badge ─────────────────────────────────────────────────────────── */

.trim-badge {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  background: rgba(255, 80, 80, 0.15);
  border: 1px solid rgba(255, 80, 80, 0.4);
  color: #ff6b6b;
  font-size: 0.75rem;
  padding: 0.2em 0.6em;
  border-radius: 99px;
  font-family: 'DM Mono', monospace;
  pointer-events: none;
}

/* ─── Video controls ─────────────────────────────────────────────────────── */

.video-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  max-width: 800px;
  padding: 0.5rem 0.75rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 0.625rem;
  backdrop-filter: blur(8px);
}

.ctrl-btn {
  background: none;
  border: none;
  color: #e8e8ea;
  cursor: pointer;
  font-size: 1.1rem;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.375rem;
  transition: background 0.15s;
  flex-shrink: 0;
}

.ctrl-btn:hover { background: rgba(255,255,255,0.08); }

.seek-track {
  flex: 1;
  display: flex;
  align-items: center;
}

.seek-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 3px;
  background: rgba(255,255,255,0.15);
  border-radius: 99px;
  outline: none;
  cursor: pointer;
}

.seek-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #c4a4ff;
  cursor: pointer;
  transition: transform 0.1s;
}

.seek-slider::-webkit-slider-thumb:hover { transform: scale(1.3); }

.time-display {
  font-size: 0.75rem;
  font-family: 'DM Mono', 'Fira Code', monospace;
  color: rgba(232,232,234,0.5);
  flex-shrink: 0;
  letter-spacing: 0.02em;
}

/* ─── Filter controls ────────────────────────────────────────────────────── */

.filter-controls {
  grid-row: 1 / 2;
  padding: 1.25rem 1rem;
  border-left: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.02);
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  overflow-y: auto;
}

.filter-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.25rem;
}

.filter-title {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.35);
}

.filter-reset {
  background: none;
  border: 1px solid rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.4);
  font-size: 0.7rem;
  padding: 0.15em 0.5em;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s;
}

.filter-reset:hover {
  color: #c4a4ff;
  border-color: rgba(196,164,255,0.4);
}

.filter-row {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.filter-label {
  font-size: 0.72rem;
  color: rgba(255,255,255,0.45);
  display: flex;
  justify-content: space-between;
}

.filter-value {
  font-size: 0.65rem;
  font-family: 'DM Mono', monospace;
  color: rgba(196,164,255,0.7);
}

.filter-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 2px;
  background: rgba(255,255,255,0.12);
  border-radius: 99px;
  outline: none;
  cursor: pointer;
}

.filter-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #c4a4ff;
  cursor: pointer;
}

/* ─── AI Panel toggle button ─────────────────────────────────────────────── */

.ai-panel-toggle {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: linear-gradient(135deg, #7c3aed, #4f46e5);
  color: #fff;
  border: none;
  border-radius: 99px;
  padding: 0.6rem 1.1rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  z-index: 50;
  box-shadow:
    0 4px 20px rgba(124,58,237,0.45),
    0 0 0 1px rgba(255,255,255,0.1);
  transition: transform 0.15s, box-shadow 0.15s;
}

.ai-panel-toggle:hover {
  transform: translateY(-1px);
  box-shadow:
    0 6px 28px rgba(124,58,237,0.55),
    0 0 0 1px rgba(255,255,255,0.15);
}

.ai-toggle-icon { font-size: 1rem; }
.ai-toggle-label { letter-spacing: 0.02em; }

/* ─── AI Panel drawer ────────────────────────────────────────────────────── */

.ai-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: clamp(300px, 28vw, 400px);
  height: 100vh;
  background: #111114;
  border-left: 1px solid rgba(255,255,255,0.07);
  display: flex;
  flex-direction: column;
  z-index: 100;
  box-shadow: -20px 0 60px rgba(0,0,0,0.6);
}

.ai-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.125rem;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}

.ai-header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.ai-gem-icon {
  color: #c4a4ff;
  font-size: 1rem;
}

.ai-panel-title {
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: #e8e8ea;
}

.ai-close-btn {
  background: none;
  border: none;
  color: rgba(255,255,255,0.3);
  cursor: pointer;
  font-size: 0.875rem;
  padding: 0.25rem;
  border-radius: 0.25rem;
  transition: color 0.15s;
}

.ai-close-btn:hover { color: rgba(255,255,255,0.7); }

/* ─── Suggestions ────────────────────────────────────────────────────────── */

.suggestions-rail {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  flex-shrink: 0;
}

.suggestion-chip {
  background: rgba(124,58,237,0.12);
  border: 1px solid rgba(124,58,237,0.25);
  color: rgba(196,164,255,0.9);
  font-size: 0.72rem;
  padding: 0.3em 0.75em;
  border-radius: 99px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
  line-height: 1.4;
}

.suggestion-chip:hover:not(:disabled) {
  background: rgba(124,58,237,0.22);
  border-color: rgba(124,58,237,0.45);
}

.suggestion-chip:disabled { opacity: 0.4; cursor: not-allowed; }

/* ─── Messages ───────────────────────────────────────────────────────────── */

.ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 0.875rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  scroll-behavior: smooth;
}

.ai-messages::-webkit-scrollbar { width: 4px; }
.ai-messages::-webkit-scrollbar-track { background: transparent; }
.ai-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }

.ai-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 0.5rem;
  color: rgba(255,255,255,0.2);
  text-align: center;
  margin-top: 3rem;
}

.empty-icon { font-size: 2rem; opacity: 0.3; }

.ai-msg {
  display: flex;
  gap: 0.5rem;
  max-width: 100%;
}

.ai-msg-user {
  flex-direction: row-reverse;
}

.ai-msg-user .msg-content {
  background: rgba(124,58,237,0.18);
  border: 1px solid rgba(124,58,237,0.25);
  border-radius: 1rem 0.25rem 1rem 1rem;
  margin-left: auto;
}

.ai-msg-assistant .msg-content {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 0.25rem 1rem 1rem 1rem;
}

.msg-content {
  padding: 0.6rem 0.875rem;
  max-width: 90%;
}

.msg-gem-badge {
  color: #c4a4ff;
  font-size: 0.75rem;
  margin-top: 0.5rem;
  flex-shrink: 0;
}

.msg-text {
  margin: 0;
  font-size: 0.825rem;
  line-height: 1.55;
  color: rgba(232,232,234,0.88);
}

.action-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.4rem;
}

.action-tag {
  background: rgba(196,164,255,0.1);
  color: rgba(196,164,255,0.7);
  font-size: 0.65rem;
  padding: 0.1em 0.5em;
  border-radius: 0.25rem;
  font-family: 'DM Mono', monospace;
}

/* Thinking dots */
.thinking-dots {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 0.6rem 0.875rem;
}

.thinking-dots span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #c4a4ff;
  animation: dot-pulse 1.2s ease-in-out infinite;
}

.thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
.thinking-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes dot-pulse {
  0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}

/* ─── Input area ─────────────────────────────────────────────────────────── */

.ai-input-area {
  padding: 0.75rem;
  border-top: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.interim-text {
  font-size: 0.75rem;
  color: rgba(196,164,255,0.55);
  font-style: italic;
  padding: 0 0.25rem;
  min-height: 1.1em;
}

.input-row {
  display: flex;
  gap: 0.375rem;
  align-items: flex-end;
}

.ai-textarea {
  flex: 1;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 0.625rem;
  color: #e8e8ea;
  font-size: 0.825rem;
  line-height: 1.5;
  padding: 0.5rem 0.75rem;
  resize: none;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
}

.ai-textarea:focus {
  border-color: rgba(124,58,237,0.45);
  background: rgba(255,255,255,0.06);
}

.ai-textarea::placeholder { color: rgba(255,255,255,0.2); }

.ai-textarea:disabled { opacity: 0.5; cursor: not-allowed; }

.voice-btn {
  width: 2.25rem;
  height: 2.25rem;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 0.5rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  flex-shrink: 0;
  transition: all 0.15s;
}

.voice-btn:hover { background: rgba(255,255,255,0.09); }

.voice-btn-active {
  background: rgba(239,68,68,0.15) !important;
  border-color: rgba(239,68,68,0.4) !important;
  animation: voice-pulse 1.5s ease-in-out infinite;
}

@keyframes voice-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
  50% { box-shadow: 0 0 0 4px rgba(239,68,68,0.2); }
}

.send-btn {
  width: 2.25rem;
  height: 2.25rem;
  background: linear-gradient(135deg, #7c3aed, #4f46e5);
  border: none;
  border-radius: 0.5rem;
  color: #fff;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: opacity 0.15s, transform 0.1s;
}

.send-btn:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
.send-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.voice-error {
  font-size: 0.7rem;
  color: #f87171;
  margin: 0;
  padding: 0 0.25rem;
}

/* ─── Mobile responsive ──────────────────────────────────────────────────── */

@media (max-width: 768px) {
  .editor-root {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr auto auto;
  }

  .filter-controls {
    grid-row: unset;
    flex-direction: row;
    overflow-x: auto;
    border-left: none;
    border-top: 1px solid rgba(255,255,255,0.06);
    padding: 0.75rem;
    gap: 1.25rem;
    scrollbar-width: none;
  }

  .filter-controls::-webkit-scrollbar { display: none; }
  .filter-row { min-width: 100px; }

  .ai-panel {
    width: 100%;
    height: 65vh;
    top: auto;
    bottom: 0;
    border-left: none;
    border-top: 1px solid rgba(255,255,255,0.07);
    border-radius: 1rem 1rem 0 0;
  }
}
```

---

## FILE 11: `.env.local` (required keys)

```bash
# Gemini
NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_key_here

# Google Cloud (for STT + Video Intelligence)
GOOGLE_PROJECT_ID=your_project_id
GOOGLE_CLIENT_EMAIL=your_service_account_email
GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
```

---

## FILE 12: Integration — how to wire into existing editor page

```tsx
// app/editor/[jobId]/page.tsx  (or wherever your editor lives)
import { VideoEditorPage } from '@/components/editor/VideoEditorPage'
import './editor.css' // or import in globals

export default function EditorPage({ params }: { params: { jobId: string } }) {
  // Fetch your existing job data
  // const job = await getJob(params.jobId)

  return (
    <VideoEditorPage
      videoUrl="https://your-video-url.mp4"   // or proxied YouTube URL
      videoTitle="My Video Title"
    />
  )
}
```

---

## What runs where (GPU cost breakdown)

| Task | Runs where | Cost |
|---|---|---|
| Video decode + playback | Browser HTML5 | $0 |
| CSS filters (bright/contrast/etc) | Browser GPU (user's device) | $0 |
| Caption overlay rendering | Browser CSS | $0 |
| Trim enforcement | Browser JS | $0 |
| Gemini JSON generation | Gemini API | ~$0.001/call |
| Voice → text (Chrome) | Web Speech API | $0 |
| Voice → text (fallback) | GCloud STT | ~$0.004/15sec |
| Video analysis (deep) | GCloud Video Intelligence | ~$0.10/video |
| Video analysis (lightweight) | Gemini | ~$0.001/call |

**Total per editing session: < $0.05 typically**
