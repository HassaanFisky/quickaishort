"""Viral ADK Multi-Agent Pipeline for QuickAIShort.online

Architecture: SequentialAgent(SegmentationAgent → ScoringAgent)

ScoringAgent now ingests sampled keyframes (Gemini vision) when a `video_id`
is provided, and scores `visualEnergy` + `cameraMovement` from the frames
themselves rather than guessing from text alone.

All Gemini calls go through services.gemini_client.call_gemini, which wraps
them in tenacity retry on 429 / 5xx / deadline exceeded.
"""

import json
import logging
import re
import uuid
from typing import List, Optional

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
    before_sleep_log,
)

from services.gemini_client import (
    DEFAULT_MODEL,
    call_gemini,
    call_gemini_text,
    types as genai_types,
)

load_dotenv()
logger = logging.getLogger(__name__)

_pipeline_retry = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=16),
    retry=retry_if_exception_type((TimeoutError, ConnectionError, OSError)),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class ViralAnalysis(BaseModel):
    score: int = Field(..., description="Viral score from 0-100")
    hookStrength: float = Field(
        ..., description="Score 0.0-1.0 for the first 3 seconds"
    )
    retentionPotential: float = Field(..., description="Predicted retention 0.0-1.0")
    visualEnergy: float = Field(
        default=0.5, description="0.0-1.0 visual action / energy from frames"
    )
    cameraMovement: float = Field(
        default=0.5, description="0.0-1.0 camera dynamism from frames"
    )
    salientCenterX: float = Field(
        default=0.5,
        description="Predicted horizontal center of interest (0.0-1.0) for 9:16 cropping",
    )
    hookOverlay: str = Field(
        default="", description="Punchy 1-5 word text to overlay at the start"
    )
    emotionalPeaks: List[float] = Field(
        default_factory=list,
        description="Timestamps within the clip where an 'Emotional Peak' occurs for cinematic effects",
    )
    cinematicStyle: str = Field(
        default="Impact",
        description="Editing style suggestion: 'Impact', 'Minimal', 'Dynamic'",
    )
    emotionalTriggers: List[str] = Field(
        default_factory=list, description="E.g. 'Curiosity', 'Shock'"
    )
    reasoning: str = Field(..., description="Why this segment will perform well")


class ClipSuggestion(BaseModel):
    id: str = Field(..., description="Unique identifier")
    start: float = Field(..., description="Start time in seconds")
    end: float = Field(..., description="End time in seconds")
    confidence: float = Field(..., description="AI confidence 0.0-1.0")
    reason: str = Field(..., description="Content summary")
    viralAnalysis: ViralAnalysis
    suggestedCaptions: List[str] = Field(default_factory=list)
    aspectRatio: str = "9:16"


# ---------------------------------------------------------------------------
# ADK imports
# ---------------------------------------------------------------------------

try:
    from google.adk.agents import Agent, SequentialAgent
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    from google.adk.tools import FunctionTool
    import google.genai.types as genai_types

    _ADK_OK = True
except Exception as _adk_err:
    logger.warning(
        "google-adk not installed or failed to initialize (%s) — using direct Gemini fallback for viral agent.",
        _adk_err,
    )
    _ADK_OK = False
    Agent = SequentialAgent = Runner = InMemorySessionService = FunctionTool = None  # type: ignore[assignment]
    genai_types = None  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# FunctionTool: Redis-backed viral score cache
# Zero new dependencies — uses Redis already required by queue_service.
# Sub-millisecond read. Gives ScoringAgent grounding from prior runs.
# ---------------------------------------------------------------------------


def get_viral_score_cache(video_id: str) -> dict:
    """
    Retrieve the cached top viral score for this video from a previous analysis run.

    Returns found=True with cached_score and cached_at (unix seconds) when
    a prior run exists. Returns found=False otherwise. Use this to calibrate
    your scoring against established data for the same video.
    """
    try:
        from services.queue_service import redis_conn

        data = redis_conn.hgetall(f"viral:cache:{video_id}")
        if data:
            return {
                "found": True,
                "cached_score": int(data.get("score", 0)),
                "cached_at": int(data.get("cached_at", 0)),
            }
        return {"found": False, "reason": "No prior analysis cached for this video"}
    except Exception as exc:
        return {"found": False, "reason": str(exc)}


# ---------------------------------------------------------------------------

SCORING_INSTRUCTION = (
    "Analyze the candidate segments provided in your input. "
    "For each segment, perform a deep viral analysis against current short-form trends. "
    "If frames have been provided to your prompt, score `visualEnergy` (0.0-1.0) and "
    "`cameraMovement` (0.0-1.0) from what you actually see. Otherwise estimate from "
    "the transcript and reasoning. "
    "CRITICAL: Based on the visual frames, predict the 'salientCenterX' (0.0-1.0) — this is the "
    "horizontal coordinate of the primary subject (e.g. face of the speaker). If no frames or "
    "unclear, use 0.5. "
    "Assign a 'score' (0-100) based on hook strength, retention potential, and visual energy. "
    "Generate a 'hookOverlay' — a punchy, bold 1-5 word text hook (e.g. 'THE UNTOLD TRUTH', 'WATCH "
    "UNTIL END') that will be burned onto the start of the video. "
    "Identify 'emotionalPeaks' — a list of 1-3 timestamps (seconds relative to clip start) "
    "where the speaker is most expressive or a punchline occurs. These will trigger cinematic zoom effects. "
    "Emotional Triggers must be specific (e.g. 'Instant Gratification', 'Contrarian POV'). "
    "Generate 3-5 captions optimized for high CTR. "
    "If 'user_scoring_context' is in session state and non-empty, read it and use it as "
    "calibration guidance: adjust score thresholds to reflect what has historically "
    "been actionable for this specific user. Higher weight to clips at or above their "
    "proven threshold. "
    "Schema: {id: string, start: float, end: float, confidence: float, reason: string, "
    "viralAnalysis: {score: int, hookStrength: float, retentionPotential: float, "
    "visualEnergy: float, cameraMovement: float, salientCenterX: float, hookOverlay: string, emotionalPeaks: float[], cinematicStyle: string, emotionalTriggers: string[], reasoning: string}, "
    "suggestedCaptions: string[]} "
    "Return the final JSON list. "
    "Return ONLY the JSON array — no markdown."
)


def _build_viral_pipeline():
    if not _ADK_OK:
        return None

    model = DEFAULT_MODEL
    # Configure retry options for Gemini API (429/5xx protection)
    retry_config = genai_types.HttpRetryOptions(
        initial_delay=2.0,
        attempts=5,
    )
    generate_config = genai_types.GenerateContentConfig(
        http_options=genai_types.HttpOptions(retry_options=retry_config)
    )

    segmentation_agent = Agent(
        name="SegmentationAgent",
        model=model,
        generate_content_config=generate_config,
        description="Identifies high-potential viral segments from a video transcript.",
        instruction=(
            "Analyze the transcript provided in session state 'transcript_text'. "
            "Find 3-7 self-contained 'hook' moments. "
            "Constraints: each segment must be 15-59 seconds. "
            "Focus on tension, surprising facts, or clear emotional peaks. "
            "Output JSON list: [{'start': float, 'end': float, 'reason': string}]. "
            "Store this JSON in session state key 'raw_segments'. "
            "Return ONLY the JSON array — no markdown."
        ),
    )

    # ScoringAgent has access to get_viral_score_cache to ground predictions
    # against real historical data from prior runs of this video.
    _scoring_tools = [FunctionTool(get_viral_score_cache)] if FunctionTool else []
    scoring_agent = Agent(
        name="ScoringAgent",
        model=model,
        generate_content_config=generate_config,
        description="Scores viral potential, optionally ingesting keyframes (vision).",
        instruction=SCORING_INSTRUCTION,
        tools=_scoring_tools,
    )

    root_agent = SequentialAgent(
        name="Viral_Orchestrator",
        sub_agents=[segmentation_agent, scoring_agent],
    )

    from agent.firestore_session import FirestoreSessionService

    try:
        session_service = FirestoreSessionService()
        logger.info("Viral agent using Firestore session service")
    except Exception as fs_err:
        logger.warning(
            "Firestore unavailable (%s) — falling back to InMemorySessionService",
            fs_err,
        )
        session_service = InMemorySessionService()
    return Runner(
        agent=root_agent,
        session_service=session_service,
        app_name="QuickAIShort_ViralEngine",
    )


_viral_runner_cache: Optional[Runner] = None


def get_viral_runner() -> Optional[Runner]:
    """Lazy initializer for the Viral runner."""
    global _viral_runner_cache
    if _viral_runner_cache is not None:
        return _viral_runner_cache

    if not _ADK_OK:
        return None

    try:
        runner = _build_viral_pipeline()
        _viral_runner_cache = runner
        return runner
    except Exception as exc:
        logger.error("Lazy viral runner init failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Vision: extract frames for any segment we have a video_id for
# ---------------------------------------------------------------------------


def _maybe_extract_frames(
    video_id: Optional[str],
    segments: list[dict],
    *,
    frames_per_clip: int = 4,
) -> dict[int, list[bytes]]:
    """Map segment-index -> list[jpeg bytes]. Empty when no video_id is given."""
    if not video_id or not segments:
        return {}
    try:
        from services.frame_extractor import extract_clip_frames
    except Exception as exc:
        logger.warning("frame_extractor unavailable: %s", exc)
        return {}

    out: dict[int, list[bytes]] = {}
    for idx, seg in enumerate(segments):
        try:
            start = float(seg.get("start", 0))
            end = float(seg.get("end", start))
            if end <= start:
                continue
            extracted = extract_clip_frames(
                video_id, start, end, frames=frames_per_clip
            )
            if extracted:
                out[idx] = [f.data for f in extracted]
        except Exception as exc:
            logger.warning("frame extract failed for segment %d: %s", idx, exc)
    return out


# ---------------------------------------------------------------------------
# Direct Gemini fallback (used when ADK is missing or for re-scoring)
# ---------------------------------------------------------------------------


async def _direct_gemini_pipeline(
    transcript_text: str,
    duration: float,
    video_id: Optional[str],
    existing_segments: Optional[list[dict]] = None,
) -> list[ClipSuggestion]:
    """
    Direct Gemini pipeline. If existing_segments is provided, it skips segmentation
    and only performs (vision-grounded) scoring.
    """
    if existing_segments:
        raw_segments = existing_segments
    else:
        seg_prompt = (
            "Find 3-7 viral segments (15-59s each) in this transcript. Each segment should "
            "be self-contained and hook-worthy. Return a JSON list of "
            "{'start': float, 'end': float, 'reason': string}. No markdown.\n\n"
            f"Transcript: {transcript_text}\nDuration: {duration}s"
        )
        try:
            seg_text = await call_gemini_text(seg_prompt, json_mode=True)
            raw_segments = json.loads(seg_text) if seg_text else []
        except Exception as exc:
            logger.error("Direct Gemini segmentation failed: %s", exc)
            return []

    frames_by_segment = _maybe_extract_frames(video_id, raw_segments)

    score_parts = [
        f"Score these viral segments. {SCORING_INSTRUCTION}\n\n"
        f"raw_segments: {json.dumps(raw_segments)}\n"
    ]
    if frames_by_segment and genai_types is not None:
        contents = [genai_types.Part(text=score_parts[0])]
        for idx, frames in frames_by_segment.items():
            contents.append(genai_types.Part(text=f"Frames for segment index {idx}:"))
            for frame_bytes in frames:
                contents.append(
                    genai_types.Part(
                        inline_data=genai_types.Blob(
                            mime_type="image/jpeg", data=frame_bytes
                        )
                    )
                )
        try:
            response = await call_gemini(
                genai_types.Content(role="user", parts=contents),
                generation_config={"response_mime_type": "application/json"},
            )
            text = getattr(response, "text", "") or ""
        except Exception as exc:
            logger.error("Direct Gemini scoring (vision) failed: %s", exc)
            return []
    else:
        try:
            text = await call_gemini_text(score_parts[0], json_mode=True)
        except Exception as exc:
            logger.error("Direct Gemini scoring (text-only) failed: %s", exc)
            return []

    return _coerce_suggestions(text)


async def _rescore_with_vision(
    suggestions: list[ClipSuggestion],
    video_id: str,
    transcript_text: str,
    duration: float,
) -> list[ClipSuggestion]:
    """Escalates existing suggestions to vision-grounded scoring."""
    raw_segments = [
        {"start": s.start, "end": s.end, "reason": s.reason} for s in suggestions
    ]
    logger.info("Performing vision re-score for %d segments", len(raw_segments))
    return await _direct_gemini_pipeline(
        transcript_text, duration, video_id, existing_segments=raw_segments
    )


def _coerce_suggestions(raw: str) -> list[ClipSuggestion]:
    if not raw:
        return []
    try:
        # Strip potential markdown formatting if Gemini failed to follow "no markdown" instruction
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            # Remove ```json ... ``` or ``` ... ```
            cleaned = re.sub(
                r"^```(?:json)?\n?|\n?```$", "", cleaned, flags=re.MULTILINE
            )

        data = json.loads(cleaned)
    except Exception as exc:
        logger.warning(
            "Could not parse scoring response: %r. Error: %s", raw[:200], exc
        )
        return []

    items = data if isinstance(data, list) else data.get("clips", [])
    out: list[ClipSuggestion] = []
    for item in items or []:
        try:
            # Ensure ID exists
            if "id" not in item:
                item["id"] = str(uuid.uuid4())[:8]
            out.append(ClipSuggestion(**item))
        except Exception as exc:
            logger.warning("Skipping malformed suggestion: %s", exc)
    return out


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

import re


async def run_viral_pipeline(
    transcript_text: str,
    duration: float,
    video_id: Optional[str] = None,
    user_id: str = "anonymous",
) -> list[ClipSuggestion]:
    """Run the multi-agent ADK pipeline. Falls back to direct Gemini when ADK is missing."""
    runner = get_viral_runner()
    if not _ADK_OK or runner is None or genai_types is None:
        logger.info(
            "Falling back to direct Gemini pipeline (ADK unavailable or failed to init)"
        )
        return await _direct_gemini_pipeline(transcript_text, duration, video_id)

    session_id = str(uuid.uuid4())

    initial_state = {
        "transcript_text": transcript_text,
        "video_duration": str(duration),
        "video_id": video_id or "",
        "raw_segments": "[]",
        "final_suggestions": "[]",
        "user_scoring_context": "",  # populated below from learning service
    }

    # Learning loop — read side.
    # Inject the user's historical export behaviour as scoring calibration.
    # Silently no-ops when no history exists or Redis is unavailable.
    try:
        from services.learning_service import LearningService

        ctx = LearningService.get_scoring_context(user_id)
        if ctx:
            initial_state["user_scoring_context"] = ctx
            logger.info(
                "learning_context_injected user=%s context_len=%d",
                user_id,
                len(ctx),
            )
    except Exception:
        pass

    await runner.session_service.create_session(
        app_name="QuickAIShort_ViralEngine",
        user_id=user_id,
        session_id=session_id,
        state=initial_state,
    )

    message = genai_types.Content(
        role="user",
        parts=[
            genai_types.Part(
                text=f"Process viral analysis for transcript of length {len(transcript_text)}"
            )
        ],
    )

    try:
        import time as _time
        from services.pipeline_monitor import start_run as _pm_start, end_run as _pm_end
        _run_id = await _pm_start("viral", user_id, video_id or "")
        _t0 = _time.time()

        final_text = "[]"

        @_pipeline_retry
        async def _run_viral_with_retry() -> str:
            _result = "[]"
            async for event in runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=message,
            ):
                if event.is_final_response():
                    txt = getattr(event, "text", None)
                    if not txt and hasattr(event, "content"):
                        parts = getattr(event.content, "parts", [])
                        if parts and hasattr(parts[0], "text"):
                            txt = parts[0].text
                    if txt:
                        _result = txt
            return _result

        try:
            final_text = await _run_viral_with_retry()
            await _pm_end(_run_id, "success", (_time.time() - _t0) * 1000)
        except Exception as _retry_exc:
            await _pm_end(_run_id, "failed", (_time.time() - _t0) * 1000, str(_retry_exc))
            raise

        suggestions = _coerce_suggestions(final_text)

        # Pillar 3: Always escalate to vision-grounded re-scoring if we have a video_id,
        # as ADK doesn't natively support image parts in the session state yet.
        if video_id and suggestions:
            try:
                logger.info(
                    "Escalating to vision-grounded re-scoring for video %s", video_id
                )
                rescored = await _rescore_with_vision(
                    suggestions, video_id, transcript_text, duration
                )
                if rescored:
                    suggestions = rescored
            except Exception as exc:
                logger.warning("Vision rescore skipped: %s", exc)

        # Cache the viral data and saliency mapping for this video.
        # This allows the render worker to recover salient center coordinates
        # even if the frontend doesn't pass them back in the export request.
        if video_id and suggestions:
            try:
                import time as _time
                from services.queue_service import redis_conn as _rc

                # 1. Store top score for grounding
                top = max(suggestions, key=lambda s: s.viralAnalysis.score)
                _rc.hset(
                    f"viral:cache:{video_id}",
                    mapping={
                        "score": str(top.viralAnalysis.score),
                        "cached_at": str(int(_time.time())),
                    },
                )

                # 2. Store saliency, hook & peaks map (start:end -> {cx, hook, peaks, style})
                data_map = {}
                for s in suggestions:
                    key = f"{s.start:.2f}:{s.end:.2f}"
                    data_map[key] = json.dumps(
                        {
                            "cx": s.viralAnalysis.salientCenterX,
                            "hook": s.viralAnalysis.hookOverlay,
                            "peaks": s.viralAnalysis.emotionalPeaks,
                            "style": s.viralAnalysis.cinematicStyle,
                        }
                    )

                if data_map:
                    _rc.hset(f"segment:metadata:{video_id}", mapping=data_map)
                    _rc.expire(f"segment:metadata:{video_id}", 86400)

                _rc.expire(f"viral:cache:{video_id}", 86400)  # 24h TTL
            except Exception as e:
                logger.debug("Failed to cache saliency: %s", e)

        # Level 5 Learning Loop Enforcement: Deterministic post-processing.
        # Apply the user's historical action boundary to guarantee the
        # learning signal alters the decision function.
        if suggestions and user_id and user_id != "anonymous":
            try:
                from services.learning_service import LearningService

                raw_dicts = [s.model_dump() for s in suggestions]
                adjusted_dicts = LearningService.apply_learned_decision_boundary(
                    user_id, raw_dicts
                )
                suggestions = [ClipSuggestion(**d) for d in adjusted_dicts]
            except Exception as exc:
                logger.warning("Failed to apply learned boundary: %s", exc)

        return suggestions

    except Exception as exc:
        logger.error("ADK Viral Pipeline failed: %s", exc)
        return await _direct_gemini_pipeline(transcript_text, duration, video_id)


# Compatibility shim for main.py
class ViralAgent:
    def __init__(self, _api_key: str = "") -> None:
        pass

    async def analyze_transcript(
        self,
        transcript_text: str,
        duration: float,
        video_id: Optional[str] = None,
        user_id: str = "anonymous",
    ) -> list[ClipSuggestion]:
        return await run_viral_pipeline(transcript_text, duration, video_id, user_id)


def get_viral_agent() -> ViralAgent:
    return ViralAgent()
