# 41 — AI-Native Video + Image Editing Platform Research

**Status:** Research only. Dated 2026-08-22. **Addendum 2026-08-25:** typed `/editor` chat for dead-air / shorts-packaging / restore-opening no longer bypasses Decision Intelligence. Unrelated chat still DualModelRouter. Speaker reframe still not wired.  
**Date:** 2026-08-22  
**Scope:** GitHub ecosystem + current QuickAI Short / Studio source  
**Product lock (unchanged):** Next.js + FastAPI + Gemini-only + EP-001 single ABI + GCS + Cloud Tasks ffmpeg. No Adobe/Resolve runtime. No AGPL/GPL vendoring.

Stars, forks, licenses, and last-push dates below are from GitHub API on **2026-08-22**. Source claims are from repository files, not listicles.

---

## 1. Executive conclusion

QuickAI Short already has the **kernel of an AI editing OS**. It is not “just a Shorts generator” in code. The live path is already:

```text
USER CHAT
  → DualModelRouter (Gemini JSON, luna-orchestration-v1)
  → sanitiser + Capability Registry
  → client dispatchAIActions (preview)
  → optional Kernel commit + Orchestrator plan
  → RenderManifest → Cloud Tasks ffmpeg → GCS
```

That is closer to OpenChatCut / FableCut / Kinocut than to OpusClip. The product is mid-strangler: Studio contracts exist (EP-001…004, ADR-016). **Update 2026-08-25:** director/dead-air/restore-opening chat is Decision Intelligence first; other chat still DualModelRouter. Remaining gaps: timeline truth is still split (`tracks[]` vs viral `suggestions[]`), canvas is hardcoded 1080×1920, and image editing does not exist.

**Architecture we should choose:** evolve the existing Studio Kernel into a **Creative Kernel** with two media runtimes (Video / Image) and one intelligence plane (Decision → Plan → Structured Ops → Execute → Verify). Short Editor is a **mode pack** on VideoRuntime, not a second product.

**Do not rewrite.** Do not vendor OpenChatCut (AGPL), Remotion (company license), ComfyUI (GPL), or desktop NLE hosts. Steal patterns, keep our stack.

**Build first:** (1) composition IR + tracks as sole timeline truth, (2) aspect/duration as mode not kernel, (3) DecisionRecord on the chat path, (4) Image document type on the same Kernel, (5) verification that inspects media outcomes.

---

## 2. QuickAIShort vision reconstructed from the existing codebase

Docs (`docs/studio/01-product-vision.md`, Phase 2, ADR-015) and code agree on this identity:

| Claim | Evidence |
|-------|----------|
| User is director, AI is editor | Chat → structured `AiEditorAction[]`, not free-form ffmpeg |
| Chat is the control plane | `AIPanel.tsx` + `streamEditorCommand` is the live edit path |
| Tools are craft | `fastapi/capabilities/registry.v1.json` — 80 capabilities, 38 wired / 42 partial |
| Timeline is visualization | ADR-011 / chat-primary shell; timeline remains in `editorStore` |
| Server project is authority | ADR-008 Kernel: Firestore `studio_projects` + events + revision |
| Evidence, not vibes | MediaGraph facets → `derive_suggestions()`; ADR-016 never invents silence |
| Gemini-only | `DualModelRouter` + `gemini_client.py`; no OpenAI/Anthropic product path |
| Hybrid preview + bake | Client Zustand projector; Cloud Tasks private ffmpeg renderer |

What production **actually ships today** is still Shorts-weighted: default `9:16`, sanitiser canvas `1080×1920`, viral pipeline + Pre-Flight as loud specialists, YouTube-first ingest helpers. File ingest exists. Image-native editing does not.

**Reconstructed north star (code + founder ask, not marketing):**

> A conversational creative OS where one intelligence plane understands media, selects tools, executes deterministic operations on a project document, previews instantly, bakes on the server, and iterates — for **video and image**, with Shorts as one mode.

---

## 3. GitHub ecosystem map

The 2025–2026 open-source wave split into four camps:

```text
A. Conversational / agent-native NLEs
   OpenChatCut, FableCut, kadr, framedeck, trykimu/videoeditor
   Pattern: chat/MCP writes the SAME timeline humans edit.

B. Timeline-first web NLEs (AI later / rewrite)
   OpenCut (+ classic), Clypra, freecut, openvideodev/react-video-editor, twick
   Pattern: CapCut-class UX; MCP/plugin is arriving, not mature.

C. Guardrailed media tools (no UI, or UI is secondary)
   Kinocut, auto-editor, editly, moviepy, ffmpeg-python, lossless-cut
   Pattern: typed ops + receipts + FFmpeg. Closest to our worker plane.

D. Generation / canvas / understanding (not editors)
   ComfyUI, InvokeAI, Fooocus, A1111, SAM, Grounded-SAM, whisperX,
   Open-Sora, Wan, Hunyuan, LTX, Video-LLaMA
   Pattern: produce or understand pixels. Do not confuse with NLE architecture.
```

**Second-order stack that actually matters:**

| If you look at… | Follow to… | Why |
|-----------------|------------|-----|
| OpenChatCut | Remotion + EditorCore command reducer + MCP session/approval | Shared tools for human + agent |
| FableCut | `project.json` + patch ops + revision/409 + compact get | Project document as the interface |
| Kinocut | typed FFmpeg tools + Video Receipts + `video_intent` dry-run | Fail-closed bake, not invented flags |
| OpenCut rewrite | plugin-first + MCP + Rust core + headless | Future web NLE API shape |
| WebAV + mediabunny | WebCodecs compose/mux | Pixel-accurate browser preview |
| OTIO | interchange schema | Timeline IR older than our Manifest |
| whisperX + auto-editor + PySceneDetect | text-based cut + silence + scenes | Media understanding we already partially have |
| InvokeAI / tldraw / fabric / SAM | canvas + mask + inpaint | Image runtime, not video timeline |

---

## 4. 45+ candidate repository research

**Count:** 58 genuinely relevant repositories. I did **not** pad with woodworking OpenCutList, generic MCP catalogs, or one-file paper wrappers. Weak starters are marked `WEAK` and kept only when they show a real pattern.

Categories: **A** AI-native · **B** chat-controlled · **C** agentic · **D** timeline-first · **E** generation · **F** media engines · **G** image · **H** multimodal · **I** tool/MCP · **J** infrastructure.

| # | Repo | ★ | License | Last push | What it actually is | Cats |
|---|------|--:|---------|-----------|---------------------|------|
| 1 | [OpenCut-app/OpenCut](https://github.com/OpenCut-app/OpenCut) | 85447 | MIT | 2026-08-10 | CapCut-class OSS; rewrite for Editor API, plugins, MCP, headless | A D I |
| 2 | [0xsline/OpenChatCut](https://github.com/0xsline/OpenChatCut) | 1312 | **AGPL-3.0** | 2026-08-20 | Local-first conversational NLE; shared EditorCore + MCP + Remotion | A B C D I |
| 3 | [ronak-create/FableCut](https://github.com/ronak-create/FableCut) | 619 | MIT | 2026-08-21 | Browser NLE; `project.json` is the API; MCP patch + SSE | A B C D I |
| 4 | [HelpFreedom/kadr](https://github.com/HelpFreedom/kadr) | 114 | **GPL-3.0** | 2026-08-20 | GPU editor with Claude Code in the timeline | A B C D |
| 5 | [ncounterspecialist/twick](https://github.com/ncounterspecialist/twick) | 531 | Other | 2026-06-04 | React editor SDK; canvas timeline, captions, serverless MP4 | A D J |
| 6 | [kevinrss01/framedeck](https://github.com/kevinrss01/framedeck) | 60 | none | 2026-05-25 | NL timeline + analysis + cloud render (Next/Nest/Rust) | A B D |
| 7 | [KyaniteLabs/kinocut](https://github.com/KyaniteLabs/kinocut) | 122 | Apache-2.0 | 2026-08-20 | 196 typed FFmpeg MCP tools, receipts, quality gates | C I F |
| 8 | [AIEraDev/Clypra](https://github.com/AIEraDev/Clypra) | 3128 | MIT | 2026-08-22 | Tauri/React CapCut-capability editor | D |
| 9 | [walterlow/freecut](https://github.com/walterlow/freecut) | 2070 | MIT | 2026-08-17 | Browser-only professional multitrack editor | D |
| 10 | [openvideodev/react-video-editor](https://github.com/openvideodev/react-video-editor) | 1774 | Other | 2026-06-30 | Remotion CapCut/Canva clone (designcombo lineage) | D |
| 11 | [trykimu/videoeditor](https://github.com/trykimu/videoeditor) | 2191 | Other | 2026-06-09 | “Creative copilot” video editor | A B D |
| 12 | [palmier-io/palmier-pro](https://github.com/palmier-io/palmier-pro) | 13765 | **GPL-3.0** | 2026-08-22 | macOS video editor built for AI | A D |
| 13 | [remotion-dev/remotion](https://github.com/remotion-dev/remotion) | 57044 | Remotion | 2026-08-22 | React programmatic composition/render | D E J |
| 14 | [remotion-dev/skills](https://github.com/remotion-dev/skills) | 4364 | none | 2026-08-21 | Official Remotion Agent Skills | C I |
| 15 | [AcademySoftwareFoundation/OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO) | 1960 | Apache-2.0 | 2026-08-07 | Industry editorial interchange | D J |
| 16 | [WebAV-Tech/WebAV](https://github.com/WebAV-Tech/WebAV) | 2086 | MIT | 2026-01-10 | WebCodecs browser editing SDK | F D |
| 17 | [Vanilagy/mediabunny](https://github.com/Vanilagy/mediabunny) | 6953 | MPL-2.0 | 2026-08-21 | Pure-TS WebCodecs mux/demux/encode | F J |
| 18 | [WyattBlue/auto-editor](https://github.com/WyattBlue/auto-editor) | 5038 | Unlicense | 2026-08-20 | Silence/speech-driven automatic cutting | F A |
| 19 | [mifi/lossless-cut](https://github.com/mifi/lossless-cut) | 43102 | **GPL-2.0** | 2026-08-21 | Lossless cut/join | D F |
| 20 | [mifi/editly](https://github.com/mifi/editly) | 5475 | MIT | 2025-05-12 | Declarative CLI/API video editing | F D |
| 21 | [motion-canvas/motion-canvas](https://github.com/motion-canvas/motion-canvas) | 18990 | MIT | 2026-07-02 | Code-first motion editor | D H |
| 22 | [theatre-js/theatre](https://github.com/theatre-js/theatre) | 12626 | Apache-2.0 | 2024-08-14 | Web motion-design (keyframes) | D H |
| 23 | [Comfy-Org/ComfyUI](https://github.com/Comfy-Org/ComfyUI) | 128914 | **GPL-3.0** | 2026-08-22 | Node-graph gen backend | E H |
| 24 | [invoke-ai/InvokeAI](https://github.com/invoke-ai/InvokeAI) | 27925 | Apache-2.0 | 2026-08-20 | Pro SD studio: canvas inpaint/outpaint | E G H |
| 25 | [tldraw/tldraw](https://github.com/tldraw/tldraw) | 49903 | tldraw | 2026-08-22 | Infinite-canvas SDK | G H |
| 26 | [fabricjs/fabric.js](https://github.com/fabricjs/fabric.js) | 31403 | MIT | 2026-08-18 | Canvas/SVG object engine | G J |
| 27 | [konvajs/konva](https://github.com/konvajs/konva) | 14708 | Other | 2026-08-20 | Interactive HTML5 canvas | G J |
| 28 | [Sanster/IOPaint](https://github.com/Sanster/IOPaint) | 23350 | Apache-2.0 | 2025-04-29 | AI inpaint/object-removal (archived) | G E |
| 29 | [nhn/tui.image-editor](https://github.com/nhn/tui.image-editor) | 7667 | MIT | 2023-11-20 | Full canvas photo editor | G |
| 30 | [facebookresearch/segment-anything](https://github.com/facebookresearch/segment-anything) | 54739 | Apache-2.0 | 2024-09-18 | SAM segmentation foundation | G J |
| 31 | [IDEA-Research/Grounded-Segment-Anything](https://github.com/IDEA-Research/Grounded-Segment-Anything) | 17710 | Apache-2.0 | 2024-09-05 | Text-grounded detect/segment | G C |
| 32 | [z-x-yang/Segment-and-Track-Anything](https://github.com/z-x-yang/Segment-and-Track-Anything) | 3133 | **AGPL-3.0** | 2026-07-03 | Video object segment+track | G F |
| 33 | [m-bain/whisperX](https://github.com/m-bain/whisperX) | 23687 | BSD-2 | 2026-07-13 | Word-level ASR + diarization | F J |
| 34 | [Breakthrough/PySceneDetect](https://github.com/Breakthrough/PySceneDetect) | 5115 | BSD-3 | 2026-08-19 | Scene-cut detection | F J |
| 35 | [Zulko/moviepy](https://github.com/Zulko/moviepy) | 14860 | MIT | 2026-08-11 | Python programmatic NLE | F D |
| 36 | [kkroening/ffmpeg-python](https://github.com/kkroening/ffmpeg-python) | 11007 | Apache-2.0 | 2024-08-04 | FFmpeg graph bindings (our worker already uses this class) | F J |
| 37 | [OpenShot/openshot-qt](https://github.com/OpenShot/openshot-qt) | 6188 | GPL-ish | 2026-08-17 | Desktop NLE | D |
| 38 | [KDE/kdenlive](https://github.com/KDE/kdenlive) | 5500 | **GPL-3.0** | 2026-08-22 | MLT desktop NLE | D |
| 39 | [mltframework/shotcut](https://github.com/mltframework/shotcut) | 14961 | **GPL-3.0** | 2026-08-21 | Qt NLE | D |
| 40 | [olive-editor/olive](https://github.com/olive-editor/olive) | 9118 | **GPL-3.0** | 2024-12-05 | Node+timeline NLE (stale) | D |
| 41 | [CapSoftware/Cap](https://github.com/CapSoftware/Cap) | 21059 | Other | 2026-08-21 | Open Loom: capture, **not an NLE** | J |
| 42 | [hpcaitech/Open-Sora](https://github.com/hpcaitech/Open-Sora) | 29284 | Apache-2.0 | 2026-04-09 | Open video generation | E |
| 43 | [Tencent-Hunyuan/HunyuanVideo](https://github.com/Tencent-Hunyuan/HunyuanVideo) | 12452 | Other | 2026-06-29 | Large video gen model | E |
| 44 | [Lightricks/LTX-Video](https://github.com/Lightricks/LTX-Video) | 10884 | Apache-2.0 | 2026-01-05 | Official LTX video gen | E |
| 45 | [Wan-Video/Wan2.1](https://github.com/Wan-Video/Wan2.1) | 16876 | Apache-2.0 | 2026-03-05 | Open video gen | E |
| 46 | [google-ai-edge/mediapipe](https://github.com/google-ai-edge/mediapipe) | 36686 | Apache-2.0 | 2026-08-21 | On-device face/seg/pose (we already hook this) | F G J |
| 47 | [lovell/sharp](https://github.com/lovell/sharp) | 32593 | Apache-2.0 | 2026-08-20 | Fast Node image processing | G J |
| 48 | [ImageMagick/ImageMagick](https://github.com/ImageMagick/ImageMagick) | 17201 | Other | 2026-08-22 | Server image convert/edit | G F |
| 49 | [airbnb/lottie-web](https://github.com/airbnb/lottie-web) | 32054 | MIT | 2025-09-01 | AE → web motion runtime | H J |
| 50 | [DAMO-NLP-SG/Video-LLaMA](https://github.com/DAMO-NLP-SG/Video-LLaMA) | 3140 | BSD-3 | 2024-06-04 | Audio-visual VLM | C H |
| 51 | [xzdarcy/react-timeline-editor](https://github.com/xzdarcy/react-timeline-editor) | 780 | MIT | 2026-01-25 | React timeline widget | D J |
| 52 | [b-editor/beutl](https://github.com/b-editor/beutl) | 1224 | MIT | 2026-08-22 | Cross-platform compositing NLE | D |
| 53 | [tnfe/FFCreator](https://github.com/tnfe/FFCreator) | 3157 | MIT | 2024-12-19 | Node video assembly | F |
| 54 | [scaleflex/filerobot-image-editor](https://github.com/scaleflex/filerobot-image-editor) | 1905 | MIT | 2026-06-16 | Embeddable image editor | G |
| 55 | [lllyasviel/Fooocus](https://github.com/lllyasviel/Fooocus) | 52470 | GPL-ish | 2026-08-22 | Prompt-first image gen studio | E G |
| 56 | [AUTOMATIC1111/stable-diffusion-webui](https://github.com/AUTOMATIC1111/stable-diffusion-webui) | 164609 | AGPL-ish | 2026-08-22 | Plugin image-gen OS; **not** an NLE | E G |
| 57 | [OpenCut-app/opencut-classic](https://github.com/OpenCut-app/opencut-classic) | 225 | MIT | 2026-05-17 | Frozen classic OpenCut (what opencut.app runs) | D |
| 58 | [OpenShot/libopenshot](https://github.com/OpenShot/libopenshot) | 1537 | **LGPL-3.0** | 2026-08-18 | C++ editor SDK | F D |

**Already in our prior pack (`40-nle-mcp-arena-research-pack.md`), still relevant, not re-counted as new architecture:** Premiere/Resolve MCP hosts (desktop-only), `hetpatel-11/Adobe_Premiere_Pro_MCP`, `jenkinsm13/resolve-mcp`, `samuelgursky/davinci-resolve-mcp`. Lesson stands: steal taxonomy, never the host.

**WEAK / skip as architecture:** `jtydhr88/ComfyUI-OpenCut`, `Pablituuu/react-video-editor`, `sambowenhughes/a-react-video-editor`, `designcombo/remotion-timeline`. Thin wrappers.

**Not found as named:** `designcombo/react-video-editor` (lineage is now `openvideodev/react-video-editor`), `WyattBlue` lives at `WyattBlue/auto-editor` not `wyhinton`, `WebAV-Tech/WebAV` not `WebAV-team`, `Comfy-Org/ComfyUI` not `comfyanonymous`. Official `microsoft/visual-chatgpt` / `microsoft/JARVIS` did not surface as first-class hits in this search pass; the pattern (LLM routes to visual tools) is still valid and already reinvented better by MCP + typed tools.

---

## 5. Deep analysis of the strongest projects

### 5.1 OpenChatCut — closest product analog (do not copy code)

**Repo:** https://github.com/0xsline/OpenChatCut · AGPL-3.0 · Electron + React 19 + Remotion + Vercel AI SDK + MCP.

**What the source actually does**

- `src/editor/` is an **LLM-free editing core**: immutable timeline, command layer (`storeCommands.ts`, `storeCommandBuilder.ts`), reducers split by concern (`reducerTimeline.ts`, `reducerHistory.ts`, `reducerClipActions.ts`, `sequenceGraph.ts`, `silenceRebuild.ts`).
- Built-in agent and external MCP clients call the **same EditorCore commands**. README: “There are no separate project formats that can drift apart.”
- Edit session protocol: `begin_edit_session` → draft tools only → `review_edit_session` (`manual` | `auto`) → one atomic undo step. Generation/export/delete are **excluded from drafts** because they cannot roll back.
- Transcript is first-class (`src/transcript/`), linked to captions and text-based cuts.
- Preview = Remotion Player + WebGL; export = Remotion + FFmpeg + FCPXML.
- Local-first store under `~/.openchatcut`. Multi-tenant SaaS is explicitly out of scope.

**Why it works:** one command ABI, proposal isolation, human approval, undoable commits, real tracks.

**Assumptions that do NOT hold for QuickAI:** local-first desktop, AGPL, Remotion license, BYOK multi-provider (OpenAI/Claude/Gemini), single-user MCP.

**Adapt:** shared command ABI; draft session + review; refuse irreversible tools inside a reversible proposal; compact agent context; sequence graph for silence rebuild.

**Do not copy:** code, Remotion-as-core, Electron, multi-LLM, AGPL infection.

### 5.2 FableCut — cleanest project-document interface

**Repo:** https://github.com/ronak-create/FableCut · MIT · one `server.js` + `app.js` + `mcp-server.js`.

**Source evidence (`mcp-server.js` read in full):**

- **Seven tools**, not 196: `status`, `docs`, `get_project` (full | compact), `patch_project`, `set_project`, `import_media`, `analyze_reference`.
- `fablecut_patch_project` is the real ABI: `addClip | updateClip | removeClip | addMedia | removeMedia | setProject`. All-or-nothing. Revision bump. Atomic write (`tmp` + rename).
- Compact get hides default props so the agent sees **deviation, not the whole document**. Token-efficient by design.
- Optimistic concurrency: revision mismatch → conflict, not silent overwrite. `force` only if the user explicitly asks.
- Image, SVG, video, audio are **the same clip kinds** on one timeline. Image is not a second product.
- Browser compositor **is** the preview; ffmpeg encodes frames for export. Agents do not invent filter graphs.

**Why it works:** the project file is the interface; patches are cheap; humans and agents share one document.

**Assumptions that do not hold:** single local project, no multi-tenant auth, no credit meter, no server-authoritative event log, compositor = browser only (breaks longform / Safari / iOS).

**Adapt:** compact project summary for Gemini; patch ops over full-document rewrite; revision conflicts (we already have `base_revision` in Kernel); treat image as a clip/asset kind.

**Do not copy:** “one JSON file is truth” without Kernel events; zero-dep toy server as production; MediaRecorder as the only bake.

### 5.3 Kinocut — best guardrailed bake / tool plane

**Repo:** https://github.com/KyaniteLabs/kinocut · Apache-2.0 · 196 MCP / 167 CLI.

**Source/docs evidence:**

- Agents never invent raw FFmpeg flags. Typed tools + preflight + **Video Receipt** provenance.
- `video_intent` dry-runs a plan without mutating media. `video_review_run` / `video_review_decide` quality-gate (blackdetect, LUFS, first-15s).
- `shorts-package` is fail-closed unless `--allow-fail`. Honest refuse > silent no-op.
- Still/plate editor exists beside video — image is a tool surface, not a fork.
- Local-first; not a hosted editor.

**Why it works:** execution is deterministic; receipts make iteration possible; intent ≠ mutate.

**Adapt:** our Registry already has `orchestrator_emit`, `cost_class`, `requires_facets`. Add **receipts** (tool id + params + artifact + quality metrics) and a **dry-run / ASK** path (ADR-016 already started this). Map Kinocut-style QC to export readiness chips.

**Do not copy:** 196-tool dump into Gemini context; always-on local FFmpeg daemon; Shorts-only packaging as the product identity.

### 5.4 OpenCut — best consumer timeline UX, architecture in flux

**Repo:** https://github.com/OpenCut-app/OpenCut · MIT.

README is explicit: **rewrite in progress**. Public site still runs `opencut-classic`. Promised: Editor API, plugin-first, Rust core (web/desktop/mobile), MCP, headless batch, in-editor scripting. Contributions closed until architecture lands.

**Adapt:** watch the Editor API / plugin ABI. Do not bet the company on a moving rewrite. Classic is a UX reference, not an OS kernel.

### 5.5 Remotion + remotion/skills

Best **composition-as-code** model in React. Skills repo is the official agent surface.

**Do not adopt as our render core.** Company license, cost, and a second render plane fighting Cloud Tasks ffmpeg. We already have `RenderManifest` → `manifest_renderer.py`. Remotion is a **lesson** (composition is data + a player), not a dependency.

### 5.6 WebAV + mediabunny

The correct long-term **browser pixel engine** if we need preview ≌ export. MIT / MPL-2.0. Complements, does not replace, server ffmpeg.

### 5.7 OpenTimelineIO

Industry IR for clips/tracks/transitions/markers. Use as a **schema checklist** against `RenderManifest`. Do not import the C++ stack.

### 5.8 auto-editor + whisperX + PySceneDetect

Battle-tested **media understanding** for “remove the boring parts,” text-based cut, scene bounds. Unlicense / BSD. These belong in AnalysisAgent / MediaGraph facets — not as the editor.

### 5.9 InvokeAI + fabric/konva + SAM / Grounded-SAM + IOPaint

This is the **image runtime** stack, not the video one.

- InvokeAI: professional canvas, inpaint, layers, history. Apache-2.0. Closest “image studio” architecture.
- fabric.js / Konva: object canvas we can own (MIT / permissive).
- SAM / Grounded-SAM: click + text masks. Foundation, not a product.
- IOPaint: object removal UX (archived; Apache-2.0). Pattern only.

**Do not** stand up A1111 or Fooocus as QuickAI. They are gen UIs, GPL/AGPL-adjacent, and they make generation the product.

### 5.10 Desktop NLEs + Premiere/Resolve MCP

Kdenlive / Shotcut / Olive / OpenShot prove timeline + graph + render are separate. Premiere/Resolve MCP prove a **huge tool taxonomy** and “refuse instead of lie.” They require a desktop host. **Never** a Cloud Run dependency (already decided in doc 40).

---

## 6. Architecture patterns worth adopting

1. **One command ABI for human + AI** (OpenChatCut EditorCore; our EP-001 + `dispatchAIActions` + Kernel `accept_command`).
2. **Project document is the interface** (FableCut `project.json`; our Kernel head + RenderManifest snapshot).
3. **Patch ops, not full rewrites** (FableCut `patch_project`; our `ProjectCommand` + events).
4. **Compact agent view** (FableCut compact get; we still dump too much transcript/state into Gemini).
5. **Draft session + approval** (OpenChatCut `begin_edit_session` / `review_edit_session`; maps to ADR-016 ACT/ASK + Kernel ack).
6. **Irreversible tools cannot live in a reversible draft** (OpenChatCut excludes generate/export/delete).
7. **Intent dry-run before mutate** (Kinocut `video_intent`; ADR-016 DecisionRecord).
8. **Receipts + quality gates** (Kinocut Video Receipt; our `execution_integrity` must grow past Kernel event_ids).
9. **Evidence kinds stay distinguishable** (our ADR-016 — keep; rare in OSS).
10. **Image is a media kind on the same project** (FableCut clip kinds; Kinocut still/plate) — not a second app.
11. **Mode packs on one engine** (aspect 16:9 / 9:16 / 1:1 in FableCut settings; OpenChatCut `aspectTypes.ts`) — Shorts is a preset.
12. **Hybrid preview/bake** (everyone serious: browser compose + server/ffmpeg encode). We already chose this (ADR-001 + Cloud Tasks).
13. **Sequence / media graph** (OpenChatCut `sequenceGraph.ts`; our MediaGraph) — tools require facets.
14. **Plugin ABI later, kernel now** (OpenCut rewrite warning).

---

## 7. Architecture patterns to avoid

| Pattern | Seen in | Why it is dangerous for us |
|---------|---------|----------------------------|
| Greenfield rewrite of a working editor | OpenCut rewrite, olive stall | We already forbade this (Phase 2 A1) |
| AGPL “closest clone” | OpenChatCut | License infection of a commercial SaaS |
| Remotion as the NLE | OpenChatCut, openvideodev, vanta | Second render plane + license + cost |
| LLM emits raw FFmpeg / shell | countless demos | Nondeterministic, unsafe, unverifiable |
| 196 tools stuffed into one prompt | Kinocut surface if used naively | Token waste; we already have emit gating |
| Generation graph as the editor | ComfyUI, A1111 | Wrong metaphor; GPL; spend unbounded |
| Desktop NLE as cloud runtime | Premiere/Resolve MCP | Cannot run on Cloud Run |
| Browser store as multi-year truth | early OpenCut classic, our ADR-001 old reading | Blocks collab, receipts, automation |
| Heuristic chips as creative truth | our retired INSTANT_SUGGESTIONS | Phase 2 already killed this |
| Silent no-op / fake success | many “AI editors” | Kernel ack ≠ objective met (ADR-016) |
| Always-on GPU worker | Comfy / local UIs | Violates cost policy |
| Multi-provider “just add Claude” | OpenChatCut, kadr | Gemini lock + spend + identity |
| Two products (Shorts app + Studio app) | common SaaS split | Doubles ABI and UI debt |

---

## 8. AI agent architecture findings

**Best agent loop in the wild (synthesized):**

```text
READ compact project + media graph
  → DECIDE (ACT / ASK / RESEARCH / NOTHING)
  → PLAN structured ops (capability ids + params + deps)
  → optional DRAFT (isolated, reversible only)
  → EXECUTE through one ABI
  → RECEIPT (events + artifacts + metrics)
  → VERIFY against the stated objective
  → REPLY in human language with tool ids
```

OpenChatCut implements draft/review/undo. Kinocut implements intent/review/receipt. FableCut implements patch + conflict. **Nobody open-source combines all four plus multi-tenant spend gates.** That combination is our actual moat if we finish it.

QuickAI today:

| Step | Status |
|------|--------|
| Read | Partial (`current_state` + transcript slice; MediaGraph not always in chat) |
| Decide | Dead-air / shorts-packaging / restore-opening: ADR-016 on typed chat. Other chat: DualModelRouter |
| Plan | Gemini JSON `actions[]`; Orchestrator refuses free text |
| Draft | Missing (optimistic client apply is not a draft) |
| Execute | `dispatchAIActions` + optional Kernel |
| Receipt | Kernel `event_ids` on gated path only |
| Verify | Tier 0 (events + silence re-check). **No post-cut media observation** |
| Reply | Model `message` + suggestions; honesty depends on sanitiser drops |

ADK Pre-Flight is a **specialist skill**, not the brain (ADR-016). Keep it that way.

Native FunctionDeclaration (ADR-006) is still Phase 2. Ecosystem evidence: MCP + typed tools beat prompt-JSON, but **registry-generated declarations** are the only safe way to get there. Do not hand-write a second tool list.

---

## 9. Chat-to-edit architecture findings

The winning conversational architecture is **not** “chat beside Premiere.” It is:

**Chat = control plane. Timeline = inspector. Preview = projector. Kernel = authority.**

Required distinctions (founder ask — confirmed by every serious repo):

| Layer | Owns | Must not do |
|-------|------|-------------|
| User intent | Natural language + chips | Execute media |
| Decision | ACT/ASK/RESEARCH/NOTHING + why + evidence | Invent facts |
| Plan | Ordered capability calls + deps | Call Gemini again per step |
| Structured ops | Registry-valid params | Raw NL, raw ffmpeg |
| Execution | Client preview and/or server/worker | Skip sanitiser |
| Verification | Objective vs receipt vs media | Treat HTTP 200 as success |
| Result | Human reply + undo | Claim “done” on preview-only |

Ambiguous prompts (“make this feel faster”) must **ASK or RESEARCH**, not guess cuts. Deterministic prompts with evidence (“remove silences > 600ms”) must **ACT with 0 Gemini** when MediaGraph already has the facet. That is already written in `decision_service.py`. It is not on the default `/editor` chat path.

Human approval: destructive / spend / irreversible (export, dub bake, generate, delete, publish) require confirm. Preview-class ops (trim, caption style, seek) apply optimistically with undo.

---

## 10. Video editing architecture findings

A real video editor, OSS or ours, has four documents:

1. **Asset catalog** — media ids, duration, codec, waveforms, proxies  
2. **Composition / timeline** — tracks, clips, links, transitions, keyframes  
3. **Understanding graph** — transcript, silence, scenes, faces, beats  
4. **Bake contract** — portable IR → encoder

OpenChatCut and FableCut keep (1)+(2) in one project and treat (3) as jobs. We split (2) across Zustand `tracks[]` **and** viral `suggestions[]`, keep (3) in MediaGraph, and keep (4) as RenderManifest. The split in (2) is the video-architecture bug.

Longform vs shortform is **not** two engines. It is:

- duration policy  
- proxy / chunked acquisition (we already chunk >120s)  
- playhead/virtualization  
- analysis windowing  
- export timeout / CRF

Do not fork the Kernel for “Video Editor.”

---

## 11. Image editing architecture findings

Image OSS is mature **as canvas + mask + gen**, immature **as conversational tool OS**.

| Need | Best evidence | Use |
|------|---------------|-----|
| Object canvas | fabric.js (MIT), Konva | ImageRuntime view |
| Infinite canvas / spatial agent | tldraw (custom license — do not vendor) | Pattern only |
| Inpaint / remove | InvokeAI, IOPaint | Server tool later, Gemini-safe |
| Text/click mask | SAM, Grounded-SAM | Media understanding, not UI clone |
| Encode | sharp / ImageMagick | Image bake (cheap, scale-to-zero) |
| Gen | Gemini image + optional later models | Capability, not the product |

**Wrong:** treat an image as a 1-frame video timeline. That infects image UX with playheads and ripples.  
**Right:** shared Asset + Transform + Layer + Mask + History + Tool invocation. Video adds Time. Image adds Spatial selection.

QuickAI has `TOGGLE_BACKGROUND_REMOVE` UI with **no VideoCanvas implementation**. That is a lie. Do not add more image chrome until ImageRuntime exists.

---

## 12. Shared image/video platform architecture

```text
                    ┌─────────────────────────────┐
                    │        Creative Kernel       │
                    │  Project · Events · Revision │
                    │  Registry · Orchestrator     │
                    │  Decision · MediaGraph       │
                    │  Credits · Auth · Receipts   │
                    └─────────────┬───────────────┘
                                  │
              ┌───────────────────┴───────────────────┐
              ▼                                       ▼
     VideoRuntime                              ImageRuntime
     tracks, time, A/V                         layers, 2D space
     captions, ripple                          masks, crops
     preview: <video>+overlays                 preview: canvas
     bake: ffmpeg Manifest                     bake: sharp/IM
              │                                       │
              └─────────────┬─────────────────────────┘
                            ▼
                   Shared capabilities
                   CROP, RESIZE, CAPTION, GRADE,
                   REMOVE_BG, GENERATE, EXPORT…
                   params specialize per runtime
```

**Share:** identity of assets, tool ABI, project memory, undo event log, chat, decision, spend, storage (GCS), auth.  
**Do not share:** playhead, fps, ripple delete, audio ducking, 9:16 sanitiser canvas.

An image used as a video opening frame is an **asset reference** from VideoRuntime → Image asset, not an image editor embedded in the timeline widget.

---

## 13. Timeline / edit representation findings

**IR we should standardize (already half-built):**

| Layer | Format | Role |
|-------|--------|------|
| Capability call | `{type: "REMOVE_SILENCES", gaps: [...]}` | What the AI/human asked the tool to do |
| ProjectEvent | Kernel event + inverse | Causal history / undo |
| Composition snapshot | `RenderManifest` | Authoritative picture for bake + reload |
| Agent compact view | derived summary | What Gemini is allowed to see |
| Mode preset | `{aspect, maxDuration, exportPolicy}` | Short vs long vs square vs image |

FableCut’s patch ops are a good **transport** shape. OTIO is a good **completeness** checklist (gaps, transitions, markers, nesting). OpenChatCut’s command reducer is a good **execution** shape.

**Do not** let Gemini write RenderManifest blobs directly. Manifest is compiled from Kernel state (`compileRenderManifest.ts`), same as today.

Viral `suggestions[]` must stop being a second timeline. Clips live on `tracks[]`. Suggestions become MediaGraph-backed **intents**, not clip storage.

---

## 14. Rendering architecture findings

| Job | Best evidence | QuickAI choice |
|-----|---------------|----------------|
| Interactive preview | FableCut compositor; our `<video>` + Web Audio + overlays | **Keep.** Fastest, cheapest. |
| Pixel-accurate preview | WebAV + mediabunny | **Later**, only if Manifest/ffmpeg drift becomes a product bug |
| Fast structural edits | Client command apply (everyone) | **Keep** ADR-001 projector |
| Deterministic final | Kinocut / our `manifest_renderer` + ffmpeg | **Keep** Cloud Tasks `min=0` |
| Background bake | Our Cloud Tasks + runId + DLQ | **Keep.** Best SaaS pattern in this research. |
| Browser final export | MediaRecorder / ffmpeg.wasm | Preview-only. wasm path already archived. Honest copy stays. |
| Image bake | sharp / ImageMagick | **New**, scale-to-zero, not a GPU service |
| Remotion SSR | OpenChatCut | **Reject** as core |

Hybrid is the industry consensus for products that must feel instant and export real files. We already have it. Finish Manifest coverage; do not add a third encoder.

---

## 15. Media intelligence findings

| Signal | Ecosystem best | QuickAI now | Action |
|--------|----------------|-------------|--------|
| Transcript | whisperX (word + speakers) | Browser Whisper `.en` | Keep browser; add word-level + speaker as facets when needed |
| Silence | auto-editor | Heuristic segments + MediaGraph | Wire Decision ACT (done on BE) into chat |
| Scenes | PySceneDetect | `sceneDetection.ts` not mandatory | Facet, not always-on Gemini |
| Faces / reframe | MediaPipe (we hook `useFaceTracker`) | Not orchestrated | Capability when evidence exists |
| Beats | FableCut `analyze.js` / our `beatDetection.ts` | Fragmented | Facet |
| Objects / “move person left” | Grounded-SAM + tracking | Missing | Image/video tool **after** mask infra |
| Reference look | FableCut `analyze_reference` | Missing | Research-mode blueprint, 0 fake cuts |
| Virality | Our Pre-Flight + viral agent | Strong specialist | Skill, not default brain |

**Cost rule stays:** cache facets, never call Gemini to rediscover silence. AnalysisAgent aggregates existing signals before any new model.

---

## 16. QuickAIShort current architecture audit

Live chat path (docs that still cite `useAiCommander.ts` are stale):

```text
AIPanel.sendMessage
  → gemini-editor.streamEditorCommand
  → POST /api/ai-editor/command/stream
  → DualModelRouter.execute(TimelinePlanOutput)
  → sanitise()
  → dispatchAIActions
  → optional orchestratorPlan/Execute (flag) → Kernel.accept_command
```

`applyAiEdits` exists on the store and is **unused**. Chat therefore skips `pushAiSnapshot` (AI undo hole).

| Subsystem | File | Verdict |
|-----------|------|---------|
| Registry | `fastapi/capabilities/registry.v1.json` | Keep. 80 caps, 38 wired |
| Sanitiser | `fastapi/services/ai_editor_sanitiser.py` | Keep. Hardcoded 1080×1920 is debt |
| Router | `fastapi/agent/router.py` `DualModelRouter` | Keep. Prompt-JSON until ADR-006 |
| Legacy engine | `fastapi/services/ai_editor_engine.py` | Not HTTP production; test duplicate |
| Kernel | `fastapi/services/project_kernel.py` | Keep. Flag-gated |
| MediaGraph | `fastapi/services/media_graph_service.py` | Keep |
| Orchestrator | `fastapi/services/orchestrator_service.py` | Keep. Free-text refused (correct) |
| Decision | `fastapi/services/decision_service.py` | Keep. **Not on chat** |
| Manifest | `compileRenderManifest.ts` + `manifest_renderer.py` | Keep / expand |
| Store | `frontend/src/stores/editorStore.ts` | Dual timeline models |
| Ingest | `useIngestLifecycle` | Keep as sole ingest FSM |
| Render | Cloud Tasks + private worker | Keep |
| Image | — | **Absent** |
| Pre-Flight | `agent/preflight_agent.py` | Keep as skill |

---

## 17. QuickAIShort architecture gaps

1. Chat ≠ Decision → Plan → Verify. Chat is still LLM-JSON → apply.  
2. 42 partial capabilities refuse at runtime — registry over-promises.  
3. `tracks[]` vs `suggestions[]` dual timeline.  
4. 9:16 / 1080×1920 / 60s template baked into sanitiser, export, render_service.  
5. No ImageRuntime, no IMAGE element, background-remove toggle is dead.  
6. `execution_sheet` validated server-side, ignored on FE.  
7. `applyAiEdits` dead; AI undo on chat broken.  
8. Compact project view for the model does not exist.  
9. Draft/proposal isolation does not exist (optimistic apply is not a draft).  
10. Tier 1 media verification does not exist.  
11. Native function calling does not exist (ADR-006).  
12. Docs drift (`useAiCommander`, RQ-as-primary in older C4 notes).  
13. Longform is acquisition-chunked but UX/analysis still Shorts-shaped.  
14. Generation (image/video) is not a first-class reversible-vs-irreversible tool class.

**Assumptions that block evolution if we keep them:**

- “The product is a vertical Shorts clipper”  
- “Canvas is 1080×1920”  
- “Viral suggestions are the timeline”  
- “Kernel ack means the edit worked”  
- “Image is a later marketing slide”

**Debt if we continue unchanged:** two products, two ABIs, more partial tools, Gemini spend on problems MediaGraph already solved, and a rewrite temptation when image finally arrives.

---

## 18. Recommended target architecture

**Name:** Creative Kernel OS (evolution of Studio Kernel — not a new brand).

```text
Ingest (YouTube | file | image | URL)
        ↓
Media Understanding (facets; cache; no Gemini by default)
        ↓
Project Intelligence (Kernel head + events + MediaGraph + mode pack)
        ↓
Chat control plane
        ↓
Decision Intelligence ──ASK/RESEARCH──▶ honest question / analyze job
        │ ACT
        ▼
Orchestrator Plan (structured_steps only)
        ↓
Tool Runtime
   ├─ ClientTools (preview, undoable)
   ├─ ServerTools (translate, analysis)
   └─ WorkerTools (ffmpeg, dub, image bake, generate)
        ↓
Receipt + Verify
        ↓
Preview projector  |  Final bake
```

No new queue. No new LLM. No new render plane. No second registry.

---

## 19. Recommended core abstractions

| Abstraction | Already exists? | Stabilise as |
|-------------|-----------------|--------------|
| `Capability` | Yes (EP-001) | 10-year ABI. Image caps added here, not in a new file. |
| `ProjectCommand` / `ProjectEvent` | Yes (EP-002) | Causal log for video **and** image |
| `RenderManifest` | Yes | Composition IR. Add `kind: video \| image` + generic canvas |
| `MediaGraph` | Yes | Domain-agnostic facets |
| `DecisionRecord` | Yes | Mandatory on mutating chat once UX copy ships |
| `Plan` | Yes | How, never what |
| `ModePack` | **No** | `{id: shorts\|longform\|square\|image, aspect, maxDuration, exportPolicy, defaultTools}` |
| `Asset` | Partial | Shared blob+metadata for A/V/image |
| `Receipt` | Partial (`execution_integrity`) | tool + params + event_ids + metrics + artifacts |
| `CompactProjectView` | **No** | Token-cheap agent read |
| `EditSession` (draft) | **No** | Optional; after Decision is on chat |

Shorts-specific stays in `ModePack.shorts` + viral/Pre-Flight skills. Not in sanitiser constants.

---

## 20. Recommended AI / tool orchestration model

```text
USER INTENT
    ↓
resolve_objective(MediaGraph, command, mode)     # 0 Gemini when evidence exists
    ↓
if ASK/RESEARCH/NOTHING → reply, 0 mutate
if ACT →
    create_plan(structured_steps)                 # Orchestrator
    execute_plan → Kernel.accept_command
    verify(receipt, objective, optional re-measure)
    reply(tool ids, event ids, residual risk)
```

LLM (`DualModelRouter`) is used when:

- Decision cannot bind evidence to a capability  
- User wants a multi-step creative plan (“make it cinematic”)  
- Repair of invalid JSON (Terra, one shot)

LLM is **not** used when:

- Silence gaps are already in MediaGraph  
- User clicks a grounded chip with params  
- Play/pause/seek

ADR-006 native FC: generate FunctionDeclarations **from the registry emit=true subset** after chat honesty ships. Keep JSON fallback one release.

MCP: **do not** expose a public multi-tenant MCP in v1 (OpenChatCut itself says single-user). Internal MCP-shaped tool schema is fine; our HTTP + Registry is enough.

---

## 21. Short Editor vs Video Editor architecture

**One VideoRuntime. Two ModePacks.**

| | Short Editor | Video Editor |
|---|--------------|--------------|
| Engine | VideoRuntime + Kernel | Same |
| Aspect | 9:16 default | 16:9 default, user-switchable |
| Duration policy | Soft 60s target, not a hard kernel clamp | Minutes; chunked acquire already exists |
| Suggestions | Hook, silence, captions, reframe, viral skill | Chapters, scenes, multi-cam later |
| Export | 1080×1920 + watermark rules by tier | 1080p/4K by tier; same Manifest |
| Chat | Same control plane | Same |
| Timeline | Same tracks model; denser virtualization later | Same |

UI can hide longform inspectors in Shorts mode (progressive disclosure). **Do not** maintain two stores, two sanitiser canvases, or two registries.

Image Editor is the third **mode of the product**, first **runtime of a new kind**.

---

## 22. Recommended implementation sequence

Research-only now. When implementation is approved, this is the only sequence that does not create a second architecture:

1. **Truth pass (no UX):** tracks as sole timeline; Manifest compile ignores `suggestions[]` as storage; chat uses `applyAiEdits` or equivalent so AI undo works; kill dead `ai_editor_engine` HTTP myths in docs.  
2. **ModePack:** aspect/duration/export policy out of sanitiser constants; 9:16 becomes Shorts default, not platform law.  
3. **Decision on chat** (flag + founder copy): dead-air ACT 0 Gemini; ASK when evidence missing.  
4. **CompactProjectView** for Gemini (FableCut lesson).  
5. **Receipt + Tier 1 verify** for `REMOVE_SILENCES` (re-measure).  
6. **Image domain v0:** Asset + Image document + CROP/RESIZE/CAPTION/EXPORT on canvas; no gen yet.  
7. **ADR-006** native FC from registry.  
8. **Draft/approval sessions** for irreversible tools.  
9. **WebAV preview** only if bake drift is measured.  
10. **Generation capabilities** as irreversible WorkerTools with spend receipts.

Each step is independently shippable. No rewrite.

---

## 23. High-risk architectural decisions

| Decision | Risk | Ruling |
|----------|------|--------|
| Vendor OpenChatCut / Remotion | AGPL + license + stack break | **No** |
| Stand up ComfyUI for “Studio” | GPL, GPU always-on, gen-as-product | **No** |
| Public MCP in production | Auth, tenancy, prompt injection into tools | **Not v1** |
| Native FC before registry honesty | Second dialect | **After** sequence 1–5 |
| Pixel-identical WebCodecs now | Cost, Safari, months of work | **Defer** |
| Image as 1-frame video | Wrong UX, locked timeline | **No** |
| Second queue / second renderer | FinOps + ops | **No** |
| Second LLM provider | Policy + spend | **No** |
| Treat Kernel ack as success | User-trust bug | **Forbidden** (ADR-016) |
| Big-bang “Video Editor” app | Split brain | **No** — ModePack |

---

## 24. Open questions requiring human decisions

1. **Image v1 scope:** canvas crop/caption/export only, or also Gemini image generate in the first cut? (Recommend: edit first, generate later.)  
2. **Draft sessions in chat:** always propose-then-apply, or only for irreversible/spend tools? (Recommend: latter.)  
3. **Longform SLA:** what max duration do we promise on Cloud Run 900s + chunked acquire?  
4. **whisperX / speaker diarization:** browser-only vs server job (cost).  
5. **WebAV investment:** only after a measured preview≠export bug, or proactive?  
6. **Public MCP / Codex control of a user’s cloud project:** security + product — not a technical default.  
7. **Deploy + Gemini credits:** ADR-016 gated path is on a branch; live proof blocked on founder top-up (existing working memory).

---

## 25. Final architecture recommendation

### If we were building QuickAIShort today from this codebase, to become a serious AI-native video + image platform rather than another Shorts generator:

**Choose:** Creative Kernel OS — strangler evolution of the current Studio Kernel. Chat is the control plane. Decision → structured capabilities → Kernel events → Manifest bake. Two media runtimes (Video, Image). Short Editor is a ModePack.

**Keep:** Next.js, FastAPI, Gemini, EP-001 registry, sanitiser, DualModelRouter, Project Kernel, MediaGraph, Orchestrator, Decision service, RenderManifest, Cloud Tasks ffmpeg, GCS, JWT, credit fail-closed, ingest FSM, Pre-Flight as a skill, client preview projector.

**Replace (concepts, not overnight files):** 9:16-as-kernel, viral `suggestions[]` as timeline, chat-without-decision, unused `applyAiEdits` path, hardcoded 1080×1920 sanitiser canvas, “partial” tools advertised as live, product identity as clip factory, docs that cite `useAiCommander`.

**Build first:** ModePack + tracks-as-truth + Decision on chat + CompactProjectView + Image document on the same Kernel. Then receipts/verify. Then native FC. Then generation.

**Deliberately avoid:** rewrite; OpenChatCut/Remotion/ComfyUI/A1111 as dependencies; desktop NLE hosts; raw NL→ffmpeg; second registry/queue/renderer/LLM; image-as-fake-video; public multi-tenant MCP; always-on GPU; cloning CapCut pixel-for-pixel; treating HTTP 200 as “the boring parts are gone.”

That is the strongest technical and product case supported by this repository and by the 2026 open-source evidence.

---

## Appendix — Comparative winners (evidence-ranked)

| Concern | Winner to learn from | Winner to run in QuickAI |
|---------|----------------------|--------------------------|
| Conversational architecture | OpenChatCut session + FableCut compact/patch | Our chat + Decision + Registry (finish wiring) |
| Video timeline | OpenCut classic UX; OpenChatCut command core | `tracks[]` + Manifest (fix dual model) |
| AI agent loop | OpenChatCut draft/review + Kinocut intent/receipt | ADR-016 + Orchestrator + receipts |
| Media processing | Kinocut + auto-editor + whisperX | Existing acquisition + MediaGraph + ffmpeg |
| Rendering | Hybrid consensus; Kinocut receipts | Cloud Tasks ffmpeg + client preview |
| Image editing | InvokeAI canvas + fabric/SAM | New ImageRuntime, same Kernel |
| Tool orchestration | Kinocut typed tools; FableCut small ABI | EP-001 (do not grow to 196 blindly) |
| Project state | FableCut revision + OpenChatCut commands | Kernel (already better for SaaS) |
| Best OSS implementation to read | FableCut (MIT, one sitting) + Kinocut | — |
| Best DX | FableCut CLAUDE.md as agent manual | Generate ours from registry |
| Best extensibility | OpenCut plugin-first (future) + our Registry | Registry + ModePack |
| Most promising to learn | OpenChatCut + FableCut + Kinocut triad | — |
| Most dangerous to copy | OpenChatCut (AGPL+Remotion) and ComfyUI-as-editor | — |

---

## Sources (primary)

- This repository: `docs/studio/01-product-vision.md`, `03-architecture.md`, `06-ai-architecture.md`, `07-agent-architecture.md`, `08-media-pipeline.md`, `09-rendering-pipeline.md`, ADRs 001/006/007/008/015/016, `PHASE2_ARCHITECTURAL_TRUTH_REVIEW.md`, `40-nle-mcp-arena-research-pack.md`
- This repository (code): `fastapi/capabilities/registry.v1.json`, `fastapi/agent/router.py`, `fastapi/routers/ai_editor_router.py`, `fastapi/services/{ai_editor_sanitiser,project_kernel,media_graph_service,orchestrator_service,decision_service}.py`, `frontend/src/components/editor/AIPanel.tsx`, `frontend/src/lib/gemini-editor.ts`, `frontend/src/stores/editorStore.ts`
- GitHub (2026-08-22): repositories in §4; full README + directory/source reads for OpenChatCut, FableCut `mcp-server.js`, Kinocut README, OpenCut README
