# 25 — Troubleshooting

| Symptom | Likely cause | Check |
|---------|--------------|-------|
| 402 on AI edit | No credits | stats/credits; paywall UI |
| 401 on API | JWT secret mismatch | `NEXTAUTH_SECRET` FE↔BE |
| Black frames export | Bad media URI / non-mp4 labeled mp4 | GCS object; URI scheme drift |
| AI “edited” but nothing changed | Action not handled in store | Coverage matrix TD-08 |
| Suggestions feel generic | Instant title heuristics only | Expected until AnalysisAgent |
| Advanced panels missing | Need `?advanced=1` | EditorLayout |
| Whisper slow | COEP/COOP only on `/editor` | next.config headers |
| FFmpeg.wasm hang | CDN block | 15s timeout path in workspace |
| Worker jobs orphaned | Crash before terminal meta | recover_stale_jobs; DLQ |
| `/ready` flapping | Heavy init in probe path | Ensure deferred startup checks |

Unverified environment-specific issues: mark Insufficient evidence and capture logs.
