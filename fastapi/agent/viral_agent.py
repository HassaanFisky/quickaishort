"""Viral ADK Multi-Agent Pipeline for QuickAIShort.online

Architecture: SequentialAgent(SegmentationAgent → ScoringAgent)

ScoringAgent now ingests sampled keyframes (Gemini vision) when a `video_id`
is provided, and scores `visualEnergy` + `cameraMovement` from the frames
themselves rather than guessing from text alone.

All Gemini calls go through services.gemini_client.call_gemini, which wraps
them in tenacity retry on 429 / 5xx / deadline exceeded.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from typing import List, Optional

from dotenv import load_dotenv
from pydantic import BaseModel, Field

from services.gemini_client import (
    DEFAULT_MODEL,
    call_gemini,
    call_gemini_text,
    types as genai_types,
)

load_dotenv()
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class ViralAnalysis(BaseModel):
    score: int = Field(..., description="Viral score from 0-100")
    hookStrength: float = Field(..., description="Score 0.0-1.0 for the first 3 seconds")
    retentionPotential: float = Field(..., description="Predicted retention 0.0-1.0")
    visualEnergy: float = Field(default=0.5, description="0.0-1.0 visual action / energy from frames")
    cameraMovement: float = Field(default=0.5, description="0.0-1.0 camera dynamism from frames")
    emotionalTriggers: List[str] = Field(default_factory=list, description="E.g. 'Curiosity', 'Shock'")
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
    import google.genai.types as genai_types

    _ADK_OK = True
except ImportError:
    logger.warning("google-adk not installed — using direct Gemini fallback for viral agent.")
    _ADK_OK = False
    Agent = SequentialAgent = Runner = InMemorySessionService = None  # type: ignore[assignment]
    genai_types = None  # type: ignore[assignment]


SCORING_INSTRUCTION = (
    "Analyze the candidate segments provided in your input. "
    "For each segment, perform a deep viral analysis against current short-form trends. "
    "If frames have been provided to your prompt, score `visualEnergy` (0.0-1.0) and "
    "`cameraMovement` (0.0-1.0) from what you actually see. Otherwise estimate from "
    "the transcript and reasoning. "
    "Assign a 'score' (0-100) based on hook strength, retention potential, and visual energy. "
    "Emotional Triggers must be specific (e.g. 'Instant Gratification', 'Contrarian POV'). "
    "Generate 3-5 captions optimized for high CTR. "
    "Schema: {id: string, start: float, end: float, confidence: float, reason: string, "
    "viralAnalysis: {score: int, hookStrength: float, retentionPotential: float, "
    "visualEnergy: float, cameraMovement: float, emotionalTriggers: string[], reasoning: string}, "
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

    scoring_agent = Agent(
        name="ScoringAgent",
        model=model,
        generate_content_config=generate_config,
        description="Scores viral potential, optionally ingesting keyframes (vision).",
        instruction=SCORING_INSTRUCTION,
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
            "Firestore unavailable (%s) — falling back to InMemorySessionService", fs_err
        )
        session_service = InMemorySessionService()
    return Runner(
        agent=root_agent,
        session_service=session_service,
        app_name="QuickAIShort_ViralEngine",
    )


viral_runner = _build_viral_pipeline()


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
            contents.append(
                genai_types.Part(text=f"Frames for segment index {idx}:")
            )
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
        {"start": s.start, "end": s.end, "reason": s.reason}
        for s in suggestions
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
            cleaned = re.sub(r"^```(?:json)?\n?|\n?```$", "", cleaned, flags=re.MULTILINE)
        
        data = json.loads(cleaned)
    except Exception as exc:
        logger.warning("Could not parse scoring response: %r. Error: %s", raw[:200], exc)
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
    if not _ADK_OK or viral_runner is None or genai_types is None:
        logger.info("Falling back to direct Gemini pipeline (ADK unavailable)")
        return await _direct_gemini_pipeline(transcript_text, duration, video_id)

    session_id = str(uuid.uuid4())

    initial_state = {
        "transcript_text": transcript_text,
        "video_duration": str(duration),
        "video_id": video_id or "",
        "raw_segments": "[]",
        "final_suggestions": "[]",
    }

    await viral_runner.session_service.create_session(
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
        final_text = "[]"
        async for event in viral_runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=message,
        ):
            if event.is_final_response():
                final_text = getattr(event, "text", None)
                if not final_text and hasattr(event, "content"):
                    parts = getattr(event.content, "parts", [])
                    if parts and hasattr(parts[0], "text"):
                        final_text = parts[0].text
                
                final_text = final_text or "[]"
                break

        suggestions = _coerce_suggestions(final_text)

        # Pillar 3: Always escalate to vision-grounded re-scoring if we have a video_id,
        # as ADK doesn't natively support image parts in the session state yet.
        if video_id and suggestions:
            try:
                logger.info("Escalating to vision-grounded re-scoring for video %s", video_id)
                rescored = await _rescore_with_vision(
                    suggestions, video_id, transcript_text, duration
                )
                if rescored:
                    return rescored
            except Exception as exc:
                logger.warning("Vision rescore skipped: %s", exc)

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
