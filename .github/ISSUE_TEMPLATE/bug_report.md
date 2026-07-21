---
name: 🐛 Bug Report (Production-Grade)
about: Report a reproducible, verified error in the QuickAI Short production pipeline
title: 'bug: [Short description of the issue]'
labels: bug, production
assignees: ''
---

### 🚨 Production Bug Description
A clear and concise description of the runtime failure, the specific agent or component affected (e.g., ADK, Web Worker, FFmpeg worker), and the perceived severity.

### 👣 Step-by-Step Replication Path
1. Go to URL / Page: `...`
2. Perform Action: `...`
3. Input Parameter / Payload: `...`
4. Observed Behavior: `...`

---

### 📊 Telemetry, Logs & Console Dumps
Paste the exact traceback, FastAPI container stdout logs, browser console prints, or Pusher event details:
```text
# Paste raw logs / exception stacks here
```

---

### 💻 Environment & Deployment Context
- **OS/Deployment Target:** (e.g., Google Cloud Run, Vercel Production, Local Windows 11)
- **Node.js / Python Version:** (e.g., Node 20.12.0, Python 3.12.3)
- **FastAPI / Next.js Context:** (e.g., FastAPI, Next.js 14.2.35)
- **Affected Pipeline Segment:** (e.g., YouTube extraction, Whisper transcription, FFmpeg render queue)

---

### 🎯 Expected Correct Behavior
Describe how the feature *should* behave in a normal production environment under typical constraints.

---

### 🛠️ Proposed Solution & Remediation Steps (Optional)
If you have analyzed the source code and identified the root cause, describe your proposed fix or provide a brief patch draft:
```python
# Optional code snippet / fix draft
```
