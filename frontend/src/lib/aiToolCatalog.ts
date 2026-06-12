/**
 * Single source of truth for all AI Editor tools.
 * execMode="direct" → 0 credits, dispatches through store.
 * execMode="gemini" → 1 credit, routes through useAiCommander.
 */

import type { AiEditorAction } from "@/types/ai-editor";

export type ToolCategory =
  | "AI Intelligence"
  | "Timeline"
  | "Captions"
  | "Audio"
  | "Visual"
  | "Elements"
  | "Playback"
  | "Export";

export type ToolExecutionMode = "direct" | "gemini";

export interface ToolExecutionContext {
  currentTime: number;
  duration: number;
  selectedClipId: string | null;
  selectedElementId: string | null;
  captionCount: number;
  elementCount: number;
  captionsEnabled: boolean;
  audioBoost: number;
  playbackSpeed: number;
  visualFilter: "None" | "Urban" | "Retro" | "Cinematic";
  isPlaying: boolean;
  lastCaptionId: string | null;
  selectedElementScale: number;
}

export interface AiTool {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  iconName: string;
  keywords: string[];
  shortcut?: string;
  execMode: ToolExecutionMode;
  buildActions?: (state: ToolExecutionContext) => Array<{
    type: AiEditorAction["type"];
    payload: Record<string, unknown>;
  }>;
  geminiPrompt?: string;
  isEnabled?: (state: ToolExecutionContext) => boolean;
}

export const AI_TOOL_CATALOG: AiTool[] = [
  // ── AI Intelligence ──────────────────────────────────────────────────────────
  {
    id: "ai-find-viral-moments",
    name: "AI · Find viral moments",
    description: "Gemini surfaces the 3 strongest hook moments from the transcript.",
    category: "AI Intelligence",
    iconName: "Sparkles",
    keywords: ["viral", "moments", "find", "hooks", "best parts", "ai", "detect"],
    execMode: "gemini",
    isEnabled: (s) => s.duration > 0,
    geminiPrompt:
      "Analyse this video's transcript and surface the top 3 viral moments. Return as DETECT_VIRAL_MOMENTS with timestamps and a one-sentence hook for each.",
  },
  {
    id: "ai-generate-hook",
    name: "AI · Write hook caption",
    description: "Gemini drafts 3 punchy first-3-second hooks tuned for retention.",
    category: "AI Intelligence",
    iconName: "Wand2",
    keywords: ["hook", "caption", "title", "write", "first impression", "ai"],
    execMode: "gemini",
    isEnabled: (s) => s.duration > 0,
    geminiPrompt:
      "Write 3 punchy hook captions for the opening 3 seconds of this clip. Return as GENERATE_HOOK_CAPTION.",
  },
  {
    id: "ai-suggest-style",
    name: "AI · Suggest style preset",
    description: "Gemini picks Urban / Retro / Cinematic based on the content mood.",
    category: "AI Intelligence",
    iconName: "Palette",
    keywords: ["style", "preset", "look", "vibe", "ai", "mrbeast", "cinematic"],
    execMode: "gemini",
    isEnabled: (s) => s.duration > 0,
    geminiPrompt:
      "Suggest the single best style preset (Urban, Retro, or Cinematic) for this clip and return as SUGGEST_STYLE_PRESET with a one-sentence reason.",
  },
  {
    id: "ai-explain-last-edit",
    name: "AI · Explain last edit",
    description: "Gemini summarises what your most recent edits changed.",
    category: "AI Intelligence",
    iconName: "MessageSquareQuote",
    keywords: ["explain", "why", "summary", "what changed", "ai", "help"],
    execMode: "gemini",
    geminiPrompt:
      "Explain in plain English what my last edit accomplished. Return as EXPLAIN_LAST_EDIT with high/medium/low confidence.",
  },

  // ── Timeline ─────────────────────────────────────────────────────────────────
  {
    id: "split-clip-at-playhead",
    name: "Split clip at playhead",
    description: "Cut the selected clip at the current playhead position.",
    category: "Timeline",
    iconName: "Scissors",
    keywords: ["split", "cut", "divide", "slice", "razor"],
    shortcut: "Cmd+\\",
    execMode: "direct",
    isEnabled: (s) => s.duration > 0,
    buildActions: (s) => [{ type: "SPLIT_CLIP", payload: { time: s.currentTime } }],
  },
  {
    id: "set-in-point",
    name: "Set in-point here",
    description: "Trim the clip to start at the current playhead position.",
    category: "Timeline",
    iconName: "CornerDownRight",
    keywords: ["trim", "in", "start", "cut start", "in-point"],
    execMode: "direct",
    isEnabled: (s) => s.duration > 0 && s.currentTime < s.duration - 0.5,
    buildActions: (s) => [{ type: "TRIM", payload: { start: s.currentTime, end: s.duration } }],
  },
  {
    id: "set-out-point",
    name: "Set out-point here",
    description: "Trim the clip to end at the current playhead position.",
    category: "Timeline",
    iconName: "CornerDownLeft",
    keywords: ["trim", "out", "end", "cut end", "out-point"],
    execMode: "direct",
    isEnabled: (s) => s.duration > 0 && s.currentTime > 0.5,
    buildActions: (s) => [{ type: "TRIM", payload: { start: 0, end: s.currentTime } }],
  },
  {
    id: "delete-selected-clip",
    name: "Delete selected clip",
    description: "Remove the currently selected clip from the timeline.",
    category: "Timeline",
    iconName: "Trash2",
    keywords: ["delete", "remove", "trash", "cut clip"],
    execMode: "direct",
    isEnabled: (s) => s.selectedClipId !== null,
    buildActions: (s) => [{ type: "DELETE_CLIP", payload: { id: s.selectedClipId } }],
  },
  {
    id: "select-first-clip",
    name: "Select first clip",
    description: "Select the first clip in the timeline.",
    category: "Timeline",
    iconName: "MousePointer2",
    keywords: ["select", "clip", "first", "pick"],
    execMode: "direct",
    isEnabled: (s) => s.duration > 0,
    buildActions: () => [{ type: "SELECT_CLIP", payload: { index: 0 } }],
  },

  // ── Playback ─────────────────────────────────────────────────────────────────
  {
    id: "play-pause",
    name: "Play / Pause",
    description: "Toggle video playback.",
    category: "Playback",
    iconName: "Play",
    keywords: ["play", "pause", "stop", "toggle", "resume"],
    shortcut: "Space",
    execMode: "direct",
    buildActions: (s) => [{ type: s.isPlaying ? "PAUSE" : "PLAY", payload: {} }],
  },
  {
    id: "seek-to-start",
    name: "Seek to start",
    description: "Jump the playhead to 0:00.",
    category: "Playback",
    iconName: "SkipBack",
    keywords: ["seek", "start", "beginning", "rewind", "0"],
    execMode: "direct",
    buildActions: () => [{ type: "SEEK", payload: { time: 0 } }],
  },
  {
    id: "seek-to-end",
    name: "Seek to end",
    description: "Jump the playhead to the last frame.",
    category: "Playback",
    iconName: "SkipForward",
    keywords: ["seek", "end", "last", "finish"],
    execMode: "direct",
    isEnabled: (s) => s.duration > 0,
    buildActions: (s) => [{ type: "SEEK", payload: { time: s.duration } }],
  },
  {
    id: "export-clip",
    name: "Export clip",
    description: "Render and download the current clip as MP4.",
    category: "Playback",
    iconName: "Download",
    keywords: ["export", "render", "download", "save", "publish", "mp4"],
    execMode: "direct",
    isEnabled: (s) => s.duration > 0,
    buildActions: () => [{ type: "EXPORT_CLIP", payload: {} }],
  },

  // ── Captions ─────────────────────────────────────────────────────────────────
  {
    id: "toggle-captions",
    name: "Toggle captions",
    description: "Show or hide all captions on the canvas.",
    category: "Captions",
    iconName: "Captions",
    keywords: ["captions", "subtitles", "toggle", "hide", "show", "cc"],
    execMode: "direct",
    buildActions: (s) => [
      { type: "TOGGLE_CAPTIONS", payload: { enabled: !s.captionsEnabled } },
    ],
  },
  {
    id: "add-caption-at-playhead",
    name: "Add caption at playhead",
    description: "Insert a new caption starting at the current time.",
    category: "Captions",
    iconName: "Plus",
    keywords: ["caption", "add", "subtitle", "text", "insert"],
    execMode: "direct",
    isEnabled: (s) => s.duration > 0,
    buildActions: (s) => [
      {
        type: "ADD_CAPTION",
        payload: {
          text: "New caption",
          startTime: s.currentTime,
          endTime: Math.min(s.currentTime + 3, s.duration),
        },
      },
    ],
  },
  {
    id: "remove-last-caption",
    name: "Remove last caption",
    description: "Delete the most recently added caption.",
    category: "Captions",
    iconName: "Minus",
    keywords: ["remove", "delete", "caption", "undo caption"],
    execMode: "direct",
    isEnabled: (s) => s.captionCount > 0,
    buildActions: (s) =>
      s.lastCaptionId
        ? [{ type: "REMOVE_CAPTION", payload: { id: s.lastCaptionId } }]
        : [],
  },
  {
    id: "bold-last-caption",
    name: "Bold last caption",
    description: "Toggle bold styling on the most recent caption.",
    category: "Captions",
    iconName: "Bold",
    keywords: ["bold", "caption", "style", "format", "update"],
    execMode: "direct",
    isEnabled: (s) => s.captionCount > 0,
    buildActions: (s) =>
      s.lastCaptionId
        ? [
            {
              type: "UPDATE_CAPTION",
              payload: { id: s.lastCaptionId, patch: { style: { bold: true } } },
            },
          ]
        : [],
  },

  // ── Visual ───────────────────────────────────────────────────────────────────
  {
    id: "filter-cinematic",
    name: "Cinematic look",
    description: "Apply the Cinematic colour preset.",
    category: "Visual",
    iconName: "Film",
    keywords: ["cinematic", "movie", "film", "look", "dark", "moody"],
    execMode: "direct",
    buildActions: () => [
      { type: "SET_VISUAL_FILTER", payload: { filter: "Cinematic" } },
    ],
  },
  {
    id: "filter-urban",
    name: "Urban look",
    description: "Apply the Urban colour preset for a high-contrast street feel.",
    category: "Visual",
    iconName: "Building2",
    keywords: ["urban", "street", "high contrast", "city", "cool"],
    execMode: "direct",
    buildActions: () => [{ type: "SET_VISUAL_FILTER", payload: { filter: "Urban" } }],
  },
  {
    id: "filter-retro",
    name: "Retro look",
    description: "Apply the Retro warm-tone colour preset.",
    category: "Visual",
    iconName: "Camera",
    keywords: ["retro", "warm", "vintage", "nostalgic", "film"],
    execMode: "direct",
    buildActions: () => [{ type: "SET_VISUAL_FILTER", payload: { filter: "Retro" } }],
  },
  {
    id: "filter-none",
    name: "Remove visual filter",
    description: "Clear the visual preset back to default.",
    category: "Visual",
    iconName: "X",
    keywords: ["none", "remove filter", "default", "reset preset"],
    execMode: "direct",
    buildActions: () => [{ type: "SET_VISUAL_FILTER", payload: { filter: "None" } }],
  },
  {
    id: "reset-all-filters",
    name: "Reset all filters",
    description: "Clear every brightness / contrast / saturation adjustment.",
    category: "Visual",
    iconName: "RotateCcw",
    keywords: ["reset", "clear", "default", "remove filter", "undo filters"],
    execMode: "direct",
    buildActions: () => [{ type: "RESET_FILTER", payload: {} }],
  },
  {
    id: "brightness-up",
    name: "Brightness +",
    description: "Increase video brightness by 0.2 stops.",
    category: "Visual",
    iconName: "Sun",
    keywords: ["brightness", "brighter", "light", "exposure"],
    execMode: "direct",
    buildActions: () => [
      { type: "ADD_FILTER", payload: { filter: "brightness", value: 1.2 } },
    ],
  },
  {
    id: "brightness-down",
    name: "Brightness −",
    description: "Decrease video brightness by 0.2 stops.",
    category: "Visual",
    iconName: "Moon",
    keywords: ["brightness", "darker", "dim", "exposure"],
    execMode: "direct",
    buildActions: () => [
      { type: "ADD_FILTER", payload: { filter: "brightness", value: 0.8 } },
    ],
  },

  // ── Audio ─────────────────────────────────────────────────────────────────────
  {
    id: "audio-boost-up",
    name: "Boost audio +10%",
    description: "Increase audio gain by 10 percentage points.",
    category: "Audio",
    iconName: "Volume2",
    keywords: ["audio", "boost", "louder", "volume", "gain", "up"],
    execMode: "direct",
    buildActions: (s) => [
      {
        type: "SET_AUDIO_BOOST",
        payload: { value: Math.min(200, s.audioBoost + 10) },
      },
    ],
  },
  {
    id: "audio-boost-down",
    name: "Reduce audio −10%",
    description: "Decrease audio gain by 10 percentage points.",
    category: "Audio",
    iconName: "VolumeX",
    keywords: ["audio", "quieter", "reduce", "volume", "gain", "down"],
    execMode: "direct",
    buildActions: (s) => [
      {
        type: "SET_AUDIO_BOOST",
        payload: { value: Math.max(0, s.audioBoost - 10) },
      },
    ],
  },
  {
    id: "noise-reduction-on",
    name: "Noise reduction 50%",
    description: "Apply moderate background noise suppression.",
    category: "Audio",
    iconName: "Mic",
    keywords: ["noise", "suppress", "clean", "background", "hiss"],
    execMode: "direct",
    buildActions: () => [{ type: "SET_NOISE_REDUCTION", payload: { value: 50 } }],
  },
  {
    id: "noise-reduction-off",
    name: "Remove noise reduction",
    description: "Turn off all background noise suppression.",
    category: "Audio",
    iconName: "MicOff",
    keywords: ["noise", "off", "disable", "raw audio"],
    execMode: "direct",
    buildActions: () => [{ type: "SET_NOISE_REDUCTION", payload: { value: 0 } }],
  },
  {
    id: "playback-speed-up",
    name: "Speed up (cycle)",
    description: "Cycle playback speed: 100→125→150→175→200→100%.",
    category: "Audio",
    iconName: "FastForward",
    keywords: ["speed", "faster", "playback", "rate", "1.25x", "1.5x"],
    execMode: "direct",
    buildActions: (s) => {
      const steps = [100, 125, 150, 175, 200];
      const cur = steps.indexOf(s.playbackSpeed);
      const next = steps[(cur + 1) % steps.length];
      return [{ type: "SET_PLAYBACK_SPEED", payload: { value: next } }];
    },
  },

  // ── Elements ─────────────────────────────────────────────────────────────────
  {
    id: "add-text-overlay",
    name: "Add text overlay",
    description: "Insert an editable text element at the centre of the canvas.",
    category: "Elements",
    iconName: "Type",
    keywords: ["text", "overlay", "title", "add", "label", "type"],
    execMode: "direct",
    buildActions: () => [
      {
        type: "ADD_ELEMENT",
        payload: {
          element: {
            type: "TEXT",
            text: "Your text here",
            x: 540,
            y: 960,
            scale: 1,
            rotation: 0,
            color: "#FFFFFF",
          },
        },
      },
    ],
  },
  {
    id: "add-sticker",
    name: "Add ⭐ sticker",
    description: "Place a star sticker in the lower-right corner.",
    category: "Elements",
    iconName: "Star",
    keywords: ["sticker", "emoji", "star", "reaction", "overlay"],
    execMode: "direct",
    buildActions: () => [
      {
        type: "ADD_ELEMENT",
        payload: {
          element: {
            type: "STICKER",
            emoji: "⭐",
            x: 900,
            y: 1700,
            scale: 1.5,
            rotation: 0,
          },
        },
      },
    ],
  },
  {
    id: "scale-up-element",
    name: "Scale up element",
    description: "Increase the selected element's scale by 20%.",
    category: "Elements",
    iconName: "ZoomIn",
    keywords: ["scale", "resize", "bigger", "grow", "element"],
    execMode: "direct",
    isEnabled: (s) => s.selectedElementId !== null,
    buildActions: (s) =>
      s.selectedElementId
        ? [
            {
              type: "UPDATE_ELEMENT",
              payload: {
                id: s.selectedElementId,
                patch: { scale: Math.min(5, s.selectedElementScale + 0.2) },
              },
            },
          ]
        : [],
  },
  {
    id: "remove-selected-element",
    name: "Remove selected element",
    description: "Delete the currently selected canvas element.",
    category: "Elements",
    iconName: "Eraser",
    keywords: ["remove", "delete", "element", "clear", "erase"],
    execMode: "direct",
    isEnabled: (s) => s.selectedElementId !== null,
    buildActions: (s) =>
      s.selectedElementId
        ? [{ type: "REMOVE_ELEMENT", payload: { id: s.selectedElementId } }]
        : [],
  },
  {
    id: "toggle-transitions",
    name: "Toggle transitions",
    description: "Enable or disable clip transition animations.",
    category: "Elements",
    iconName: "Layers",
    keywords: ["transitions", "animation", "fade", "dissolve", "toggle"],
    execMode: "direct",
    buildActions: () => [{ type: "TOGGLE_TRANSITIONS", payload: { enabled: true } }],
  },
  {
    id: "toggle-voiceover",
    name: "Toggle voiceover",
    description: "Enable or disable AI voiceover on the clip.",
    category: "Elements",
    iconName: "AudioLines",
    keywords: ["voiceover", "voice", "tts", "narration", "toggle"],
    execMode: "direct",
    buildActions: () => [{ type: "TOGGLE_VOICEOVER", payload: { enabled: true } }],
  },

  // ── B-Roll ───────────────────────────────────────────────────────────────────
  {
    id: "broll-open-library",
    name: "Open B-Roll library",
    description: "Open the Pexels B-roll drawer to search and add overlay clips.",
    category: "Elements",
    iconName: "Film",
    keywords: ["broll", "b-roll", "pexels", "stock", "overlay", "library", "footage"],
    shortcut: "Shift+Alt+B",
    execMode: "direct",
    buildActions: () => [{ type: "BROLL_OPEN_LIBRARY", payload: {} }],
  },
  {
    id: "broll-ai-suggest",
    name: "AI · Suggest B-roll",
    description: "Gemini reads the transcript and suggests the best B-roll query for the current moment.",
    category: "AI Intelligence",
    iconName: "Search",
    keywords: ["broll", "b-roll", "suggest", "ai", "pexels", "stock", "context"],
    execMode: "gemini",
    isEnabled: (s) => s.duration > 0,
    geminiPrompt:
      "Based on the transcript at the current playhead position, suggest the best single Pexels B-roll search query (2–4 words). Return as BROLL_AI_SUGGEST with a `query` string.",
  },
  {
    id: "broll-clear-all",
    name: "Clear all B-roll",
    description: "Remove every B-roll clip from the V3 lane.",
    category: "Elements",
    iconName: "Trash2",
    keywords: ["broll", "b-roll", "clear", "remove", "delete all", "clean"],
    execMode: "direct",
    buildActions: () => [{ type: "BROLL_CLEAR_ALL", payload: {} }],
  },
  {
    id: "overlay-pip-tl",
    name: "Overlay: PIP top-left",
    description: "Place the selected overlay clip in a picture-in-picture box at the top-left.",
    category: "Elements",
    iconName: "LayoutPanelLeft",
    keywords: ["overlay", "pip", "top left", "picture in picture", "position"],
    execMode: "direct",
    isEnabled: (s) => s.selectedElementId !== null,
    buildActions: (s) =>
      s.selectedElementId
        ? [{ type: "UPDATE_ELEMENT", payload: { id: s.selectedElementId, patch: { position: "pip_tl" } } }]
        : [],
  },
  {
    id: "overlay-pip-tr",
    name: "Overlay: PIP top-right",
    description: "Place the selected overlay clip in a picture-in-picture box at the top-right.",
    category: "Elements",
    iconName: "LayoutPanelTop",
    keywords: ["overlay", "pip", "top right", "picture in picture", "position"],
    execMode: "direct",
    isEnabled: (s) => s.selectedElementId !== null,
    buildActions: (s) =>
      s.selectedElementId
        ? [{ type: "UPDATE_ELEMENT", payload: { id: s.selectedElementId, patch: { position: "pip_tr" } } }]
        : [],
  },
  {
    id: "overlay-split-50",
    name: "Overlay: 50/50 split",
    description: "Display the selected overlay as a full left/right 50% split screen.",
    category: "Elements",
    iconName: "Columns2",
    keywords: ["overlay", "split", "50/50", "side by side", "half screen", "position"],
    execMode: "direct",
    isEnabled: (s) => s.selectedElementId !== null,
    buildActions: (s) =>
      s.selectedElementId
        ? [{ type: "UPDATE_ELEMENT", payload: { id: s.selectedElementId, patch: { position: "split_left" } } }]
        : [],
  },

  // ── Silence removal ─────────────────────────────────────────────────────────
  {
    id: "audio-remove-silences",
    name: "AI · Remove silences",
    description: "Gemini analyses the transcript and trims silent gaps from the video.",
    category: "Audio",
    iconName: "Scissors",
    keywords: ["silence", "remove", "auto", "gaps", "trim", "speech", "ai", "clean"],
    execMode: "gemini",
    isEnabled: (s) => s.duration > 0,
    geminiPrompt:
      "Remove silent gaps from the video. Analyse the transcript to find speech segments, then return a REMOVE_SILENCES action with appropriate min_silence_sec and padding_sec values based on the content pacing.",
  },
  {
    id: "audio-remove-silences-quick",
    name: "Quick silence removal",
    description: "Remove silent gaps at default settings — 0 credits, runs instantly.",
    category: "Audio",
    iconName: "Zap",
    keywords: ["silence", "quick", "auto", "remove", "gaps", "fast", "direct"],
    execMode: "direct",
    isEnabled: (s) => s.duration > 0,
    buildActions: () => [
      { type: "REMOVE_SILENCES", payload: { min_silence_sec: 0.6, padding_sec: 0.08 } },
    ],
  },
  // ── Phase 4b: NLE Timeline Tools ─────────────────────────────────────────────
  {
    id: "timeline-pointer-select",
    name: "Pointer — select clip",
    description: "Activate the pointer tool and optionally select a clip by id.",
    category: "Timeline",
    iconName: "MousePointer2",
    keywords: ["pointer", "select", "clip", "tool", "arrow"],
    execMode: "direct",
    isEnabled: (s) => s.duration > 0,
    buildActions: (s) => [
      { type: "POINTER_SELECT", payload: { clip_id: s.selectedClipId ?? undefined } },
    ],
  },
  {
    id: "timeline-blade-split",
    name: "Blade — split at playhead",
    description: "Cut all clips at the current playhead position (razor tool).",
    category: "Timeline",
    iconName: "Scissors",
    keywords: ["blade", "split", "cut", "razor", "divide"],
    shortcut: "S",
    execMode: "direct",
    isEnabled: (s) => s.duration > 0,
    buildActions: (s) => [
      { type: "BLADE_SPLIT", payload: { time_sec: s.currentTime } },
    ],
  },
  {
    id: "timeline-ripple-trim-in",
    name: "Ripple Trim — in point",
    description: "Move the in-point of the selected clip and ripple-shift downstream.",
    category: "Timeline",
    iconName: "MoveHorizontal",
    keywords: ["ripple", "trim", "in", "point", "edge", "shift"],
    execMode: "direct",
    isEnabled: (s) => !!s.selectedClipId,
    buildActions: (s) => [
      { type: "RIPPLE_TRIM", payload: { clip_id: s.selectedClipId ?? "", edge: "in", delta_sec: 0 } },
    ],
  },
  {
    id: "timeline-rolling-trim",
    name: "Rolling Trim — edit point",
    description: "Adjust the shared edit point between two adjacent clips simultaneously.",
    category: "Timeline",
    iconName: "Repeat2",
    keywords: ["rolling", "trim", "edit", "point", "adjacent", "joint"],
    shortcut: "Shift+R",
    execMode: "direct",
    isEnabled: (s) => !!s.selectedClipId,
    buildActions: (s) => [
      { type: "ROLLING_TRIM", payload: { clip_id: s.selectedClipId ?? "", neighbor_id: "", edge: "out", delta_sec: 0 } },
    ],
  },
  {
    id: "timeline-slip",
    name: "Slip — shift source content",
    description: "Shift the source in/out of the clip without changing its timeline position.",
    category: "Timeline",
    iconName: "Move",
    keywords: ["slip", "source", "shift", "content", "offset"],
    execMode: "direct",
    isEnabled: (s) => !!s.selectedClipId,
    buildActions: (s) => [
      { type: "SLIP_CLIP", payload: { clip_id: s.selectedClipId ?? "", delta_sec: 0 } },
    ],
  },
  {
    id: "timeline-slide",
    name: "Slide — move clip in timeline",
    description: "Move a clip left/right, trimming its neighbors to fill the gap.",
    category: "Timeline",
    iconName: "MoveHorizontal",
    keywords: ["slide", "move", "clip", "timeline", "neighbor"],
    execMode: "direct",
    isEnabled: (s) => !!s.selectedClipId,
    buildActions: (s) => [
      { type: "SLIDE_CLIP", payload: { clip_id: s.selectedClipId ?? "", delta_sec: 0 } },
    ],
  },
  {
    id: "timeline-ripple-delete",
    name: "Ripple Delete — remove clip",
    description: "Delete the selected clip and close the gap by rippling downstream clips.",
    category: "Timeline",
    iconName: "Trash2",
    keywords: ["ripple", "delete", "remove", "gap", "close", "shift"],
    shortcut: "Shift+Delete",
    execMode: "direct",
    isEnabled: (s) => !!s.selectedClipId,
    buildActions: (s) => [
      { type: "RIPPLE_DELETE", payload: { clip_id: s.selectedClipId ?? "" } },
    ],
  },
  {
    id: "timeline-duration-stretch",
    name: "Duration Stretch — time-stretch clip",
    description: "Time-stretch the selected clip to a target duration or speed factor.",
    category: "Timeline",
    iconName: "Maximize2",
    keywords: ["stretch", "duration", "speed", "tempo", "time", "slow", "fast"],
    execMode: "direct",
    isEnabled: (s) => !!s.selectedClipId && s.duration > 0,
    buildActions: (s) => [
      { type: "DURATION_STRETCH", payload: { clip_id: s.selectedClipId ?? "", speed_factor: 1.0 } },
    ],
  },
  // ── Developer flags ──────────────────────────────────────────────────────────
  {
    id: "dev-toggle-webgpu-preview",
    name: "Dev · Toggle WebGPU preview",
    description: "Enable or disable the experimental WebGPU compositor layer (developer feature).",
    category: "Visual",
    iconName: "Zap",
    keywords: ["webgpu", "gpu", "compositor", "experimental", "dev", "flag", "toggle"],
    execMode: "direct",
    isEnabled: () => process.env.NODE_ENV !== "production",
    buildActions: () => [],
  },
  // ── Export ───────────────────────────────────────────────────────────────────
  {
    id: "export-webcodecs-mp4",
    name: "Export · Hardware MP4 (local)",
    description: "Export the current clip as H.264 MP4 directly in the browser using WebCodecs hardware acceleration. Feature flag: webcodecs_export_enabled.",
    category: "Export",
    iconName: "Download",
    keywords: ["export", "mp4", "download", "webcodecs", "hardware", "local", "encode"],
    execMode: "direct",
    isEnabled: (s) => s.duration > 0 && s.duration <= 60,
    buildActions: () => [],
  },
  {
    id: "dev-toggle-webcodecs-export",
    name: "Dev · Toggle WebCodecs export",
    description: "Enable or disable the WebCodecs hardware-accelerated local export path (developer feature).",
    category: "Export",
    iconName: "Zap",
    keywords: ["webcodecs", "export", "flag", "dev", "toggle", "experimental"],
    execMode: "direct",
    isEnabled: () => process.env.NODE_ENV !== "production",
    buildActions: () => [],
  },
];

export function searchTools(query: string, state: ToolExecutionContext): AiTool[] {
  const enabled = AI_TOOL_CATALOG.filter(
    (t) => !t.isEnabled || t.isEnabled(state),
  );
  const q = query.trim().toLowerCase();
  if (!q) return enabled;
  const tokens = q.split(/\s+/);
  return enabled
    .map((t) => {
      const hay = [t.name, t.description, t.category, ...t.keywords]
        .join(" ")
        .toLowerCase();
      const score = tokens.reduce(
        (acc, tok) => acc + (hay.includes(tok) ? 1 : 0),
        0,
      );
      return { tool: t, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.tool);
}
