# QuickAI Short Agent Memory & Persistence Schema

This document outlines how agents persist, retrieve, and cache session data, metrics, and calibration guidelines.

## Persistence Layers

### 1. Firestore Session Memory (`FirestoreSessionService`)
- **Use Case**: Multi-agent ADK run logs, agent consensus results, iteration state, and final decisions.
- **TTL**: Firestore collection documents do not auto-expire but are archived/deleted when projects are deleted.
- **Key Format**: `Sessions/{app_name}_{user_id}_{session_id}`
- **Fallback**: If Firestore is unreachable, falls back to `InMemorySessionService` for temporary request lifetime memory.

### 2. Redis Fast Cache & Saliency Map
- **Use Case**: Hot caching of top viral scores and video segment metadata (salient center coordinates, hook overlays, emotional peak timestamps, cinematic style suggest).
- **TTL**: 86400 seconds (24 hours) to prevent Redis memory exhaustion.
- **Key Formats**:
  - `viral:cache:{video_id}`: Hash structure storing `score` and `cached_at`.
  - `segment:metadata:{video_id}`: Hash mapping segment timestamp ranges `start:end` to stringified JSON metadata.
- **Hydration**: Checked at the start of a scoring or render run. If present, it skips expensive AI vision or coordinate regeneration.

### 3. Context Hydration (Learning Loop)
- **Use Case**: User specific scoring context representing historically exported and successful clips.
- **Hydration Trigger**: Loaded from `LearningService.get_scoring_context(user_id)` at the start of `run_viral_pipeline`.
- **Action**: Calibrates the `ScoringAgent`'s decision thresholds to ensure the agent outputs clips optimized for the specific creator.
