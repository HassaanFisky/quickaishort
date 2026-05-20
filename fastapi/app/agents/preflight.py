"""PreFlight Canvas Support Route — Real-time frame filter & cut boundary analysis.

This endpoint supports the frontend VideoEditorCanvas component by providing
real-time virality scoring, persona-based consensus, and recommendations for
video frame adjustments and cut boundaries.

Architecture:
  - PreFlight_Orchestrator: Gemini 2.5 Flash evaluation of video metadata
  - PersonaPanel: Mock parallel loop simulating 6 demographic personas
  - Weighted consensus: Aggregates persona votes into a single virality score
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Literal, Optional, Any

from pydantic import BaseModel, Field

from services.gemini_client import call_gemini, DEFAULT_MODEL
from services.auth import get_verified_user_id
from fastapi import APIRouter, Depends, HTTPException

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/preflight", tags=["preflight"])

# ────────────────────────────────────────────────────────────────────────────
# Pydantic Models
# ────────────────────────────────────────────────────────────────────────────


class FrameAdjustment(BaseModel):
    """Canvas frame filter adjustments from the editor."""

    brightness: float = Field(default=1.0, ge=0.0, le=2.0)
    contrast: float = Field(default=1.0, ge=0.0, le=2.0)
    saturation: float = Field(default=1.0, ge=0.0, le=2.0)
    hue: float = Field(default=0.0, ge=-180.0, le=180.0)
    blur: float = Field(default=0.0, ge=0.0, le=50.0)


class CutBoundary(BaseModel):
    """Video timestamp cut boundary."""

    start_sec: float = Field(ge=0.0, description="Start time in seconds")
    end_sec: float = Field(ge=0.0, description="End time in seconds")


class VideoMetadataInput(BaseModel):
    """Video metadata from the editor."""

    title: str = Field(description="Video title")
    duration: float = Field(ge=0.0, description="Duration in seconds")
    native_width: int = Field(ge=1, description="Native video width")
    native_height: int = Field(ge=1, description="Native video height")
    fps: int = Field(ge=1, description="Frames per second")
    transcript_excerpt: Optional[str] = Field(
        default=None, description="Sample transcript text"
    )


class PreflightPredictRequest(BaseModel):
    """Request body for /predict endpoint."""

    video_metadata: VideoMetadataInput
    frame_adjustments: FrameAdjustment
    cut_boundaries: list[CutBoundary] = Field(
        default_factory=list, description="Proposed cut boundaries"
    )
    trend_context: Optional[dict[str, Any]] = Field(
        default=None, description="External trend data"
    )


class PersonaVote(BaseModel):
    """Single persona's evaluation vote."""

    persona_id: str
    persona_name: str
    would_watch_full: bool
    predicted_retention_pct: float
    drop_off_second: Optional[int] = None
    hook_verdict: Literal["strong", "weak", "neutral"]
    share_likelihood: float = Field(ge=0.0, le=1.0)
    reasoning: str


class PreflightPredictResponse(BaseModel):
    """Response body for /predict endpoint."""

    request_id: str
    video_title: str
    frame_adjustments_score: float = Field(
        ge=0.0, le=100.0, description="Quality score of frame adjustments 0–100"
    )
    cut_boundaries_score: float = Field(
        ge=0.0, le=100.0, description="Quality score of cut boundaries 0–100"
    )
    persona_votes: list[PersonaVote]
    weighted_consensus_score: float = Field(
        ge=0.0, le=100.0, description="Final virality consensus 0–100"
    )
    recommendation: Literal["STRONG_PASS", "CONDITIONAL_PASS", "NEEDS_WORK", "DISCARD"]
    recommendation_reason: str
    estimated_viral_potential: Literal["VIRAL", "STRONG", "MODERATE", "WEAK"]
    adjustment_suggestions: list[str] = Field(
        default_factory=list, description="Suggestions for frame improvements"
    )
    cut_suggestions: list[str] = Field(
        default_factory=list, description="Suggestions for cut boundaries"
    )


# ────────────────────────────────────────────────────────────────────────────
# Persona Configuration
# ────────────────────────────────────────────────────────────────────────────

PERSONA_WEIGHTS: dict[str, float] = {
    "genz": 0.25,
    "millennial": 0.25,
    "sports": 0.15,
    "tech": 0.15,
    "entertainment": 0.10,
    "news": 0.10,
}

PERSONA_IDENTITIES: dict[str, str] = {
    "genz": "You are a 19-year-old TikTok-native creator. You consume 4+ hours of short-form video daily. Your attention span for a hook is 3 seconds; if it doesn't grab you immediately you scroll.",
    "millennial": "You are a 32-year-old YouTube-first professional who also watches Shorts. You value substance and clear value delivery. You tolerate a slightly longer hook (5 sec) if it signals expertise.",
    "sports": "You are a 28-year-old sports enthusiast who lives for highlight reels. You are drawn to intensity, momentum shifts, dramatic moments, and emotional payoffs. Technical quality matters less than the energy.",
    "tech": "You are a 26-year-old programmer/maker. You value innovation, speed demos, problem-solving, and technical depth. You are skeptical of hype but rewarding of genuine breakthroughs.",
    "entertainment": "You are a 24-year-old entertainment consumer obsessed with narrative and emotional arcs. You crave suspense, plot twists, relatable characters, and satisfying resolutions.",
    "news": "You are a 45-year-old news professional. You prioritize clarity, fact-based narratives, credibility signals, and context. You dislike sensationalism but appreciate strong storytelling.",
}

# ────────────────────────────────────────────────────────────────────────────
# Core Orchestrator: PreFlight_Orchestrator
# ────────────────────────────────────────────────────────────────────────────


async def preflight_orchestrator(
    video_metadata: VideoMetadataInput,
    frame_adjustments: FrameAdjustment,
    cut_boundaries: list[CutBoundary],
    trend_context: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Orchestrator: Gemini 2.5 Flash evaluation of video and frame quality.

    This function calls Gemini to score the video metadata, frame adjustments,
    and cut boundaries based on viral potential and technical quality.
    """

    prompt = f"""You are an expert video editor evaluating a short-form video for viral potential.

Analyze the following video and frame adjustments:

**Video Metadata:**
- Title: {video_metadata.title}
- Duration: {video_metadata.duration}s
- Resolution: {video_metadata.native_width}x{video_metadata.native_height} @ {video_metadata.fps}fps
- Transcript: {video_metadata.transcript_excerpt or "(no transcript provided)"}

**Frame Adjustments Applied:**
- Brightness: {frame_adjustments.brightness:.2f}x
- Contrast: {frame_adjustments.contrast:.2f}x
- Saturation: {frame_adjustments.saturation:.2f}x
- Hue Shift: {frame_adjustments.hue:.1f}°
- Blur: {frame_adjustments.blur:.1f}px

**Proposed Cut Boundaries:**
{json.dumps([{{"start": c.start_sec, "end": c.end_sec}} for c in cut_boundaries], indent=2)}

Provide a JSON response with:
{{
    "frame_adjustments_score": <0-100 quality score>,
    "cut_boundaries_score": <0-100 quality score>,
    "overall_assessment": "<brief technical assessment>",
    "frame_quality_reasoning": "<why this frame adjustment score>",
    "cut_quality_reasoning": "<why this cut boundary score>",
    "adjustment_suggestions": ["<suggestion 1>", "<suggestion 2>"],
    "cut_suggestions": ["<suggestion 1>", "<suggestion 2>"]
}}

Return ONLY valid JSON, no markdown or extra text."""

    try:
        response = await call_gemini(
            contents=prompt,
            model=DEFAULT_MODEL,
            generation_config={
                "temperature": 0.7,
                "max_output_tokens": 1024,
            },
        )

        # Parse response text
        response_text = response.text if hasattr(response, "text") else str(response)

        # Extract JSON from response
        try:
            result = json.loads(response_text)
        except json.JSONDecodeError:
            logger.warning(
                "PreFlight_Orchestrator: Failed to parse Gemini response as JSON: %s",
                response_text[:200],
            )
            result = {
                "frame_adjustments_score": 70.0,
                "cut_boundaries_score": 70.0,
                "overall_assessment": "Analysis completed with partial results",
                "frame_quality_reasoning": "Default assessment due to parsing",
                "cut_quality_reasoning": "Default assessment due to parsing",
                "adjustment_suggestions": [],
                "cut_suggestions": [],
            }

        return result

    except Exception as e:
        logger.error("PreFlight_Orchestrator error: %s", e)
        return {
            "frame_adjustments_score": 50.0,
            "cut_boundaries_score": 50.0,
            "overall_assessment": "Evaluation failed; using baseline scores",
            "frame_quality_reasoning": "Error during evaluation",
            "cut_quality_reasoning": "Error during evaluation",
            "adjustment_suggestions": [],
            "cut_suggestions": [],
        }


# ────────────────────────────────────────────────────────────────────────────
# PersonaPanel Mock: Parallel Persona Evaluation Loop
# ────────────────────────────────────────────────────────────────────────────


async def persona_evaluator(
    persona_id: str,
    persona_name: str,
    video_metadata: VideoMetadataInput,
    orchestrator_score: float,
) -> PersonaVote:
    """Mock persona evaluator: simulates a persona watching and voting on the video."""

    persona_prompt = f"""You are {PERSONA_IDENTITIES[persona_id]}

Evaluate this video for YOUR specific tastes and interests:
- Title: {video_metadata.title}
- Duration: {video_metadata.duration}s
- Transcript sample: {video_metadata.transcript_excerpt or "(not provided)"}
- Technical quality baseline score: {orchestrator_score:.0f}/100

Respond with a JSON object containing:
{{
    "would_watch_full": <true|false>,
    "predicted_retention_pct": <0-100, how long you'd watch>,
    "drop_off_second": <optional: when you'd scroll>,
    "hook_verdict": "<strong|weak|neutral>",
    "share_likelihood": <0-1.0, probability you'd share>,
    "reasoning": "<your honest brief review as this persona>"
}}

Return ONLY valid JSON."""

    try:
        response = await call_gemini(
            contents=persona_prompt,
            model=DEFAULT_MODEL,
            generation_config={
                "temperature": 0.8,
                "max_output_tokens": 256,
            },
        )

        response_text = response.text if hasattr(response, "text") else str(response)

        try:
            vote_data = json.loads(response_text)
        except json.JSONDecodeError:
            logger.warning(
                "PersonaPanel: %s failed to parse: %s", persona_id, response_text[:100]
            )
            vote_data = {
                "would_watch_full": True,
                "predicted_retention_pct": 60.0,
                "drop_off_second": None,
                "hook_verdict": "neutral",
                "share_likelihood": 0.5,
                "reasoning": "Default baseline evaluation",
            }

        return PersonaVote(
            persona_id=persona_id,
            persona_name=persona_name,
            would_watch_full=vote_data.get("would_watch_full", True),
            predicted_retention_pct=float(vote_data.get("predicted_retention_pct", 60.0)),
            drop_off_second=vote_data.get("drop_off_second"),
            hook_verdict=vote_data.get("hook_verdict", "neutral"),
            share_likelihood=float(vote_data.get("share_likelihood", 0.5)),
            reasoning=vote_data.get("reasoning", "Evaluation complete"),
        )

    except Exception as e:
        logger.error("PersonaPanel %s error: %s", persona_id, e)
        return PersonaVote(
            persona_id=persona_id,
            persona_name=persona_name,
            would_watch_full=True,
            predicted_retention_pct=50.0,
            drop_off_second=None,
            hook_verdict="neutral",
            share_likelihood=0.5,
            reasoning="Baseline due to evaluation error",
        )


async def run_persona_panel(
    video_metadata: VideoMetadataInput,
    orchestrator_score: float,
) -> list[PersonaVote]:
    """Run parallel persona evaluations (mock loop)."""

    tasks = [
        persona_evaluator(persona_id, persona_name, video_metadata, orchestrator_score)
        for persona_id, persona_name in [
            ("genz", "Gen Z Creator"),
            ("millennial", "Millennial Professional"),
            ("sports", "Sports Enthusiast"),
            ("tech", "Tech Developer"),
            ("entertainment", "Entertainment Lover"),
            ("news", "News Professional"),
        ]
    ]

    return await asyncio.gather(*tasks)


# ────────────────────────────────────────────────────────────────────────────
# Consensus Calculator
# ────────────────────────────────────────────────────────────────────────────


def calculate_weighted_consensus(persona_votes: list[PersonaVote]) -> tuple[float, str]:
    """Calculate weighted consensus score and recommendation from persona votes.

    Returns:
        (consensus_score: 0-100, recommendation: STRONG_PASS|CONDITIONAL_PASS|NEEDS_WORK|DISCARD)
    """

    if not persona_votes:
        return 50.0, "CONDITIONAL_PASS"

    # Calculate weighted scores
    weighted_score = 0.0
    total_weight = 0.0
    watch_full_count = 0
    share_count = 0

    for vote in persona_votes:
        weight = PERSONA_WEIGHTS.get(vote.persona_id, 0.1)
        total_weight += weight

        # Build composite score from persona vote
        retention_component = vote.predicted_retention_pct
        share_component = vote.share_likelihood * 100
        hook_bonus = {"strong": 15, "neutral": 0, "weak": -15}.get(
            vote.hook_verdict, 0
        )
        watch_bonus = 20 if vote.would_watch_full else -10

        vote_score = (retention_component + share_component) / 2 + hook_bonus + watch_bonus
        vote_score = max(0, min(100, vote_score))  # Clamp to 0-100

        weighted_score += vote_score * weight

        if vote.would_watch_full:
            watch_full_count += 1
        if vote.share_likelihood >= 0.7:
            share_count += 1

    final_score = weighted_score / total_weight if total_weight > 0 else 50.0

    # Determine recommendation
    watch_ratio = watch_full_count / len(persona_votes)
    share_ratio = share_count / len(persona_votes)

    if final_score >= 80 and watch_ratio >= 0.7 and share_ratio >= 0.5:
        recommendation = "STRONG_PASS"
    elif final_score >= 65 and watch_ratio >= 0.5:
        recommendation = "CONDITIONAL_PASS"
    elif final_score >= 50:
        recommendation = "NEEDS_WORK"
    else:
        recommendation = "DISCARD"

    return final_score, recommendation


# ────────────────────────────────────────────────────────────────────────────
# API Endpoint
# ────────────────────────────────────────────────────────────────────────────


@router.post("/predict", response_model=PreflightPredictResponse)
async def predict(
    req: PreflightPredictRequest,
    verified_user_id: str = Depends(get_verified_user_id),
) -> PreflightPredictResponse:
    """PreFlight real-time analysis endpoint.

    Runs the PreFlight_Orchestrator and PersonaPanel in parallel to generate
    a weighted virality consensus score and actionable recommendations for
    frame adjustments and cut boundaries.
    """

    request_id = str(uuid.uuid4())[:8]

    try:
        # Run orchestrator and persona panel in parallel
        orchestrator_result, persona_votes = await asyncio.gather(
            preflight_orchestrator(
                req.video_metadata,
                req.frame_adjustments,
                req.cut_boundaries,
                req.trend_context,
            ),
            run_persona_panel(
                req.video_metadata,
                75.0,  # Baseline score passed to persona evaluators
            ),
        )

        # Calculate consensus
        consensus_score, recommendation = calculate_weighted_consensus(persona_votes)

        # Estimate viral potential tier
        if consensus_score >= 85:
            viral_potential = "VIRAL"
        elif consensus_score >= 70:
            viral_potential = "STRONG"
        elif consensus_score >= 55:
            viral_potential = "MODERATE"
        else:
            viral_potential = "WEAK"

        return PreflightPredictResponse(
            request_id=request_id,
            video_title=req.video_metadata.title,
            frame_adjustments_score=float(
                orchestrator_result.get("frame_adjustments_score", 70.0)
            ),
            cut_boundaries_score=float(
                orchestrator_result.get("cut_boundaries_score", 70.0)
            ),
            persona_votes=persona_votes,
            weighted_consensus_score=consensus_score,
            recommendation=recommendation,
            recommendation_reason=f"Consensus {consensus_score:.0f}/100 from {len(persona_votes)} personas; {recommendation}",
            estimated_viral_potential=viral_potential,
            adjustment_suggestions=orchestrator_result.get(
                "adjustment_suggestions", []
            ),
            cut_suggestions=orchestrator_result.get("cut_suggestions", []),
        )

    except Exception as e:
        logger.error(
            "PreFlight predict failed for user %s request_id %s: %s",
            verified_user_id,
            request_id,
            e,
        )
        raise HTTPException(
            status_code=500,
            detail=f"PreFlight analysis failed: {str(e)[:100]}",
        )
