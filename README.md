# 🚀 QuickAIShort.online — Enterprise Pre-Flight & Multi-Agent Engine

[![Build Status](https://github.com/HassaanFisky/quickaishort/actions/workflows/ci.yml/badge.svg)](https://github.com/HassaanFisky/quickaishort/actions/workflows/ci.yml)
[![Linting & Hygiene](https://github.com/HassaanFisky/quickaishort/actions/workflows/linter.yml/badge.svg)](https://github.com/HassaanFisky/quickaishort/actions/workflows/linter.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Google AI Agents Challenge](https://img.shields.io/badge/Google%20AI%20Agents%20Challenge-2026-blue.svg)](https://ai.google.dev/)
[![ADK Framework](https://img.shields.io/badge/ADK%20Framework-v1.0.0-orange.svg)](https://github.com/google/agent-development-kit)
[![Stack Status](https://img.shields.io/badge/Production%20Status-Live-success.svg)](#)

> **"OpusClip identifies which clips to extract. Pre-Flight tells you if they will actually go viral."**

---

## 🌟 The Core Vision

Every short-form video generator on the market operates completely blind. Creators copy-paste a URL, hit export, and publish with zero context, hoping the algorithm picks it up. 

**QuickAI Short completely changes this.** We have shifted the paradigm from static clicking to an **interactive, conversational AI Video Editing Studio**. Creators are guided by an intelligent **Chatbot Co-Pilot** that handles everything from video cut boundaries and smart transcription-based clip adjustments to real-time high-fidelity voiceover synthesis and sidechain audio mixing.

---

## 💬 The Conversational AI Editor Chatbot & Voice Pipeline

The QuickAI Short Studio integrates a cutting-edge chatbot interface that acts as a real-time partner during the editing lifecycle:

* **Interactive Natural Language Control**: Instruct the chatbot to split clips, apply filter presets, adjust aspect ratios, or shift focus parameters using natural conversational cues.
* **Transcription-Based Dispatching**: The chatbot automatically analyzes video transcriptions and aligns edits (splits, trims, crops) to exact verbal cues.
* **High-Fidelity AI Voiceovers**: Seamlessly generate synthetic voice narrations using a curated library of professional, emotionally-aware voices.
* **Sidechain Compression Mixing**: The render worker applies standard broadcaster mixing: auto-lowering background music volume when narration is active, then boosting it back during breaks.

---

## 🏛️ Robust Agentic Architecture

At the heart of the Pre-Flight engine is an advanced multi-agent topology built exclusively on official Google ADK primitives:

```
                          ┌───────────────────────────┐
                          │    QuickAIShort Client    │
                          └─────────────┬─────────────┘
                                        │ (Video URL & Candidates)
                                        ▼
                          ┌───────────────────────────┐
                          │   FastAPI Backend Core    │
                          └─────────────┬─────────────┘
                                        │
                                        ▼
         ┌─────────────────────────────────────────────────────────────┐
         │             PreFlight_Orchestrator [SequentialAgent]        │
         └──────┬───────────────────────┬───────────────────────┬──────┘
                │                       │                       │
      ┌─────────▼──────────┐  ┌─────────▼──────────┐  ┌─────────▼──────────┐
      │ ClipCandidateAgent │  │ TrendGroundingAgent│  │ AnalyticsAgent     │
      │   (Seeds State)    │  │ (SerpAPI Grounding)│  │(YouTube Analytics) │
      └────────────────────┘  └────────────────────┘  └────────────────────┘
                                        │
                                        ▼
         ┌─────────────────────────────────────────────────────────────┐
         │             AudiencePanelLoop [LoopAgent]                   │
         │             (Iterates until consensus score >= 65)          │
         └──────┬───────────────────────────────────────────────┬──────┘
                │                                               │
      ┌─────────▼─────────────────────────────────────┐  ┌──────▼──────────────┐
      │ ParallelAgent: "PersonaPanel" (6 Parallel)    │  │ VoteAggregatorAgent │
      │ ┌───────────────────────────────────────────┐ │  │  (Pure Python)      │
      │ │ 🕶️ Gen Z Creator           (Weight: 0.25) │ │  │                     │
      │ │ 💼 Millennial Professional  (Weight: 0.25) │─┼─►│ Calculate weighted  │
      │ │ ⚽ Sports Fan               (Weight: 0.15) │ │  │ consensus score     │
      │ │ 💻 Tech Enthusiast          (Weight: 0.15) │ │  │                     │
      │ │ 🎬 Entertainment Critic     (Weight: 0.10) │ │  │ Writes back to      │
      │ │ 📰 News Analyst            (Weight: 0.10) │ │  │ session state.      │
      │ └───────────────────────────────────────────┘ │  │                     │
      └───────────────────────────────────────────────┘  └──────┬──────────────┘
                                                                │
                                                         ┌──────▼──────────────┐
                                                         │  QualityGateAgent   │
                                                         │ (Pass / Loop Exit)  │
                                                         └──────┬──────────────┘
                                                                │
                                                         ┌──────▼──────────────┐
                                                         │ ClipRefinementAgent │
                                                         │  (AI-driven recut)  │
                                                         └─────────────────────┘
```

### 🤖 Official ADK Primitives Used
1. **`SequentialAgent`**: Manages step-by-step state preparation and execution pipeline.
2. **`ParallelAgent`**: Runs 6 highly-calibrated audience personas in parallel.
3. **`LoopAgent`**: Handles recursive improvement, modifying candidate parameters dynamically until quality conditions are satisfied.
4. **`FunctionTool`**: Decorates analytical grounding layers (SerpAPI Google Trends engine, custom caching) seamlessly for automatic function calling.
5. **`MCPToolset`**: Empowers the workforce with historical local/Supabase database profiles via `@supabase/mcp-server-supabase`.

---

## ⚡ Production Tech Stack

| Layer | Technologies & Frameworks | Enterprise Utility |
| :--- | :--- | :--- |
| **Frontend** | React, Next.js 14 (App Router), Zustand, Framer Motion | High perceived speed, client-side web workers, dynamic UI. |
| **Backend** | Python 3.12, FastAPI, Celery/RQ, MoviePy, FFmpeg | Dual-process decoupled queue architecture for heavy video manipulation. |
| **AI Layer** | Google ADK 1.0.0, Gemini 2.5 Flash, `google-genai` SDK | Multimodal frame processing and lightning-fast agentic consensus. |
| **Realtime Sync** | Pusher (Channels API), WebSockets | Real-time push updates for video generation lifecycle status. |
| **Caching** | Redis Cloud, Custom Hashing | Millisecond metadata fetching and global agent task queues. |
| **Databases** | MongoDB Atlas, GridFS Storage | High-availability documents and raw binary storage with no local FS dependency. |

---

## 💼 Business Model & Opportunity

QuickAI Short addresses a **$117 Billion creator economy** and a rapidly expanding **$59 Billion short-form video market**.

| Plan | Features | Price |
| :--- | :--- | :--- |
| **Free Tier** | Basic editing, 3 standard exports/month, watermarked videos | **$0** |
| **Pro Tier** | Unlimited high-speed renders, full 6-persona Pre-Flight panel, historical Supabase MCP grounding, zero watermarks | **$12 / Month** |

---

## 🛠️ Automated CI/CD & Hygiene Checks

Our codebase operates under strict professional compliance:
1. **Linting Actions:** Automatic code layout checks via `Black` and `Flake8` protect backend clean architectures.
2. **TypeScript Compilation:** Automated CI gates ensure client-side components build cleanly before merging to production branches.
3. **Smoke Tests:** Backend module imports and pipeline binaries are validated synchronously inside the action runner on every pull request.

---

## 🚀 Elite Local Setup Guidelines

### 🐍 Backend Deployment
```bash
# Navigate to API root
cd fastapi

# Create isolated Python runtime
python -m venv venv
source venv/bin/activate  # venv\Scripts\activate on Windows

# Install locked dependencies
pip install -r requirements.txt

# Seed environment vars
cp .env.example .env  # Add your API credentials

# Spin up FastAPI microservice
uvicorn main:app --reload --port 8000
```

### 💻 Frontend Deployment
```bash
# Navigate to web root
cd ../frontend

# Safe package installation
npm install --no-fund --no-audit

# Configure local env
cp .env.example .env.local

# Run production-grade Next.js development server
npm run dev
```

---

## 🔒 Security & Safe Exception Architectures

* **Credential Hardening:** Secrets are segregated using environment configurations. No production API keys, MongoDB Atlas connection strings, or third-party webhooks are committed to the public tree.
* **Input Protection:** Safe wrappers wrap external command executions (`yt-dlp`, `ffmpeg`) protecting against malicious remote command injection vectors.
* **Safe Failures:** System operations fail gracefully, masking internal stack details from external users while maintaining structured debugging logs.

---

## 📝 License & Open Source

This repository is certified under the **MIT License**. For deep system breakdowns, see the official [ARCHITECTURE.md](ARCHITECTURE.md) and [SECURITY.md](SECURITY.md) guides.
