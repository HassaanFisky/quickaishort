# ADR-014 — Dub Video Pipeline

- **Status:** Accepted  
- **Date:** 2026-07-25  
- **Related:** ADR-002 (GCS), ADR-004 (RenderManifest), ADR-007 (Capability Registry), ADR-009 (MediaGraph)

## Context

Studio had timed English transcripts (browser Whisper), caption burn-in, and fragmented TTS/voiceover paths, but no production dubbing: no translation, no segment-aligned TTS, no mute+replace export, and `ADD_VOICEOVER` remained a no-op.

## Decision

1. **Feature name:** Dub Video (`DUB_VIDEO`). Secondary text-only action: `TRANSLATE_CAPTIONS`.
2. **Source speech v1:** English-only (`whisper-tiny.en`). Non-English ASR is out of scope until a multilingual path is explicitly shipped.
3. **Translate:** Gemini structured JSON via `gemini_client` (mockable). Cached by transcript×lang hash.
4. **Voice:** Google Cloud TTS only (`tts_service`), GCS `tts_cache/` + job artifacts under `dubs/{user}/{job}/`. Cache hits return `gs://` URIs (ADR-002).
5. **Audio model:** Mute original speech + overlay synthesized track (not lip-sync). Modes: `full_dub`, `voiceover_only`, `captions_only`.
6. **Execution:** Redis job state + Cloud Tasks `/tasks/dub` on the existing private request renderer when configured; inline fallback for local/dev. **No third queue.**
7. **Export:** `mute_source_audio` + `dub_audio_uri` forwarded on `/api/process-video` into `RenderJob` / `render_video`.
8. **Fallback:** TTS failure → `degraded` with translated subtitles and explicit UX copy. Never fake voice.

## Consequences

- Positive: Reuses ingest, Whisper, Gemini, TTS cache, Cloud Tasks worker, Manifest/export, registry honesty.
- Negative: EN-only source; requires `GOOGLE_TTS_API_KEY` + Gemini credits for full dub.
- Follow-up: Multilingual ASR; optional lip-sync research (separate ADR).
