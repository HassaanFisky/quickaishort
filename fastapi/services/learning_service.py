"""
Learning loop service — closes the feedback between agent output and user action.

Write side:  record_outcome() called by render_worker when a job succeeds.
Read side:   get_scoring_context() called by run_viral_pipeline before analysis.

Storage:     Redis list  learn:outcomes:{user_id}  (capped at 20, 30d TTL)
             Each element: JSON {video_id, job_id, viral_score, exported_at}

The learning signal: "user exported this clip" is the ground truth that an
agent score was actionable.  After N exports we can tell the ScoringAgent:
  "Your past scores of X+ led to user action — calibrate to that threshold."

No ML, no embeddings, no new dependencies.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)

_OUTCOME_KEY_PREFIX = "learn:outcomes:"
_MAX_OUTCOMES = 20  # Sliding window per user
_TTL_SECONDS = 30 * 86400  # 30 days


def _redis():
    from services.queue_service import redis_conn

    return redis_conn


class LearningService:

    @staticmethod
    def record_outcome(
        user_id: str,
        video_id: str,
        job_id: str,
    ) -> None:
        """
        Record a successful export as a positive outcome signal.

        Called by render_worker immediately after GCS upload succeeds.
        Fire-and-forget — any Redis error is silently swallowed so it
        never blocks or fails the render path.
        """
        if not user_id or user_id == "anonymous":
            return
        try:
            r = _redis()
            # Read cached viral score for this video (written by viral_agent on analysis)
            score_raw = r.hget(f"viral:cache:{video_id}", "score")
            viral_score = int(score_raw) if score_raw else None

            record = json.dumps(
                {
                    "video_id": video_id,
                    "job_id": job_id,
                    "viral_score": viral_score,
                    "exported_at": int(time.time()),
                }
            )
            key = f"{_OUTCOME_KEY_PREFIX}{user_id}"
            r.lpush(key, record)
            r.ltrim(key, 0, _MAX_OUTCOMES - 1)  # Keep last 20
            r.expire(key, _TTL_SECONDS)
            logger.info(
                "learning_outcome_recorded user=%s video=%s score=%s",
                user_id,
                video_id,
                viral_score,
            )
        except Exception as exc:
            logger.debug("learning_service.record_outcome skipped: %s", exc)

    @staticmethod
    def get_scoring_context(user_id: str) -> str:
        """
        Return a 1-3 sentence calibration string for the ScoringAgent.

        Built from the user's past export history (last 20 jobs, 30d window).
        Returns empty string when no history exists — the agent behaves as
        normal when there is nothing to calibrate against.
        """
        if not user_id or user_id == "anonymous":
            return ""
        try:
            r = _redis()
            raw_records = r.lrange(f"{_OUTCOME_KEY_PREFIX}{user_id}", 0, 19)
            if not raw_records:
                return ""

            outcomes = []
            for raw in raw_records:
                try:
                    outcomes.append(json.loads(raw))
                except Exception:
                    continue

            scores = [
                o["viral_score"] for o in outcomes if o.get("viral_score") is not None
            ]
            if not scores:
                return ""

            export_count = len(outcomes)
            avg_score = round(sum(scores) / len(scores))
            min_score = min(scores)
            max_score = max(scores)

            return (
                f"User history: {export_count} export(s) in the past 30 days. "
                f"Clips with viral score {avg_score}/100 on average were found actionable. "
                f"Score range at export time: {min_score}\u2013{max_score}. "
                f"Prioritise clips scoring at or above {avg_score}. "
                f"Downrank clips below {min_score} unless hook strength is exceptional."
            )
        except Exception as exc:
            logger.debug("learning_service.get_scoring_context skipped: %s", exc)
            return ""

    @staticmethod
    def apply_learned_decision_boundary(
        user_id: str, raw_scores: list[dict]
    ) -> list[dict]:
        """
        Deterministic decision-function update (Level 5 requirement).
        Reads the user's actual export threshold, and structurally enforces it
        on the LLM's outputs. This guarantees the learned signal changes behavior.

        raw_scores: list of ClipSuggestion objects as dicts
        """
        if not user_id or user_id == "anonymous":
            return raw_scores
        try:
            r = _redis()
            raw_records = r.lrange(f"{_OUTCOME_KEY_PREFIX}{user_id}", 0, 19)
            if not raw_records:
                return raw_scores

            scores = []
            for raw in raw_records:
                try:
                    data = json.loads(raw)
                    if data.get("viral_score") is not None:
                        scores.append(data["viral_score"])
                except Exception:
                    pass

            if not scores:
                return raw_scores

            # The discriminative boundary: the lowest score they ever found acceptable
            action_boundary = min(scores)

            for clip in raw_scores:
                va = clip.get("viralAnalysis")
                if not va:
                    continue
                score = va.get("score", 50)

                # If the LLM scored it below the user's known action boundary,
                # apply a deterministic penalty. This enforces the learning loop.
                if score < action_boundary:
                    # Penalty: cut the gap in half (e.g. boundary 70, score 60 -> becomes 55)
                    penalty = (action_boundary - score) // 2
                    va["score"] = max(0, score - penalty)
                    va["reasoning"] = (
                        va.get("reasoning", "")
                        + f" [System auto-penalized: score below user historical threshold of {action_boundary}]"
                    ).strip()

            return raw_scores
        except Exception as exc:
            logger.debug("learning_service.apply_boundary skipped: %s", exc)
            return raw_scores
