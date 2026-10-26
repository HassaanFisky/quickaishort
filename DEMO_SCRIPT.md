# Demo Video Script — QuickAI Studio
# Target length: 2:50 – 3:00
# Record at: https://www.quickaishort.online (or local QuickAI Studio environment)
# Prerequisite: Active Gemini credits (cloud) or LOCAL_FIRST_MODE=1 (local-first)

---

## Framing (say once, clearly)

**Product:** QuickAI Studio — conversational AI video editing platform.  
**Core loop:** Ingest → Chat → Preview → Export (powered by the Studio Kernel and EP-001 Capability Registry).  
**Do not show:** `/adk` Coming Soon blur as if it were a finished wizard.

---

## [0:00 – 0:20] Hook

**Say:**
"Creators shouldn't fight a complex timeline for every cut. Paste a video, talk to the editor, preview live, and export.
This is QuickAI Studio — conversational AI video editing. The AI performs the edits; you direct the creative intent."

**Screen:** Landing page (`/`) → click **Open Editor** (`/editor`).

---

## [0:20 – 0:50] Ingest

**Say:**
"I'll load a real clip — either by pasting a YouTube URL or dropping a local video file."

**Action:**
1. Paste YouTube URL or upload an MP4 via the Ingest surface  
2. Show staged ingest progress and Whisper transcription / silence detection  

**Say:**
"Whisper transcription and audio analysis run immediately so the timeline and MediaGraph are grounded in real timestamps."

---

## [0:50 – 1:40] Conversational edit

**Say:**
"I open the Studio AI chat and direct the cut in plain language — trim dead air, tighten the pacing, add bold captions, or boost the audio."

**Action:**
1. Open the AI chat panel  
2. Click a MediaGraph suggestion chip **or** type a natural-language command  
3. Show the structured edit actions updating the 9:16 canvas and multi-track timeline  

**Say:**
"Every command resolves through the frozen EP-001 Capability Registry into real timeline operations with full undo/redo support."

---

## [1:40 – 2:20] Optional — Pre-Flight skill

**Say (only if live Pre-Flight is enabled with credits):**
"When I want a second opinion before publishing, Pre-Flight runs a Google ADK multi-agent audience simulation across distinct viewer personas."

**Action:** Show persona scores / recommendation if available in the current session.

**If skipped:** Say "Pre-Flight is our optional audience-simulation skill — let's move straight to export."

---

## [2:20 – 2:45] Export

**Say:**
"When the cut feels right, Export renders the finished short — either through our Cloud Run FFmpeg pipeline to GCS, or locally on-device with native FFmpeg."

**Action:** Trigger export; show progress → completed MP4 download.

---

## [2:45 – 3:00] Close

**Say:**
"QuickAI Studio — conversation is the control plane, and the timeline proves every edit. Live at quickaishort.online."

**Screen:** QuickAI Studio emblem and URL end card.

---

## Do / Don't

| Do | Don't |
|----|-------|
| Show real timeline and canvas mutations | Fake canned analysis |
| Keep `/adk` framed as Coming Soon if shown | Present archived ADK Studio wizard as live |
| Keep timeline as verification, chat as hero | Pitch as "just another one-click clipper" |
