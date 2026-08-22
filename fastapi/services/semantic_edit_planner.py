"""Semantic Edit Planner — AI-Native Creative Kernel Intelligence Layer.

Translates high-level natural language intent into coherent, mathematically-bounded,
multi-parameter capability sequences. Operates as a fast, deterministic zero-cost
semantic engine for known creative operations while maintaining strict Capability
Registry ABI compliance.

Architecture Principles:
1. Natural language is the INPUT.
2. Structured media operations are the CONTROL LANGUAGE.
3. Media processing (Canvas WebGL/FFmpeg) is the EXECUTION LAYER.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Optional

from models.ai_editor import (
    AddFadeInAction,
    AddFadeOutAction,
    AddFilterAction,
    AiEditorAction,
    DurationStretchAction,
    EnableDenoiseAction,
    HslSecondariesAction,
    ResetColorAction,
    ResetFilterAction,
    SetAudioBoostAction,
    SetNoiseReductionAction,
    SetPlaybackSpeedAction,
    SetVisualFilterAction,
    TrimAction,
)

logger = logging.getLogger(__name__)


@dataclass
class SemanticPlanResult:
    matched: bool
    intent: str
    confidence: float
    actions: list[dict[str, Any]] = field(default_factory=list)
    message: str = ""
    suggestions: list[str] = field(default_factory=list)
    status: str = "ok"


class SemanticEditPlanner:
    """Deterministic, zero-token semantic reasoning engine for creative editing intents."""

    @classmethod
    def plan(
        cls,
        command: str,
        context: Optional[dict[str, Any]] = None,
    ) -> Optional[SemanticPlanResult]:
        """Analyze natural language command and return a semantic plan if matched."""
        c = (command or "").strip().lower()
        if not c:
            return None

        ctx = context or {}
        dur = float(ctx.get("videoDuration") or ctx.get("duration") or 60.0)

        # ── 1. Lighting & Exposure Adjustments ─────────────────────────────────────
        # "make it brighter", "fix dark video", "lift shadows"
        if re.search(r"(bright(er)?|lift\s+shadows?|too\s+dark|increase\s+brightness)", c):
            return SemanticPlanResult(
                matched=True,
                intent="brighten_and_lift_shadows",
                confidence=0.96,
                actions=[
                    {"type": "ADD_FILTER", "filter": "brightness", "value": 1.25},
                    {"type": "ADD_FILTER", "filter": "contrast", "value": 1.08},
                ],
                message="Brightened video and balanced contrast.",
                suggestions=["Warm up the color tone", "Add cinematic grade", "Boost audio volume"],
                status="ok",
            )

        # "make it darker", "dim the lighting", "moody dark"
        if re.search(r"(dark(er)?|too\s+bright|decrease\s+brightness|dim\s+(?:the\s+)?light(?:ing)?|moody\s+dark)", c):
            return SemanticPlanResult(
                matched=True,
                intent="darken_and_deepen_contrast",
                confidence=0.95,
                actions=[
                    {"type": "ADD_FILTER", "filter": "brightness", "value": 0.85},
                    {"type": "ADD_FILTER", "filter": "contrast", "value": 1.15},
                ],
                message="Lowered exposure and deepened shadows.",
                suggestions=["Make it cinematic", "Add cool blue tone", "Reset filters"],
                status="ok",
            )

        # ── 2. Color Grading & Aesthetics ──────────────────────────────────────────
        # "make it cinematic", "hollywood look", "movie style"
        if re.search(r"\b(cinematic(\s+look|\s+style|\s+feel)?|movie\s+style|hollywood\s+look|film\s+look)\b", c):
            return SemanticPlanResult(
                matched=True,
                intent="apply_cinematic_look",
                confidence=0.98,
                actions=[
                    {"type": "SET_VISUAL_FILTER", "filter": "Cinematic"},
                    {"type": "ADD_FILTER", "filter": "contrast", "value": 1.15},
                    {"type": "ADD_FILTER", "filter": "saturation", "value": 1.10},
                ],
                message="Applied rich cinematic color profile and balanced tone.",
                suggestions=["Add subtle fade in", "Enhance dialogue clarity", "Export 9:16 Short"],
                status="ok",
            )

        # "make colors pop", "vibrant", "boost saturation", "punchy colors"
        if re.search(r"\b(colors?\s+pop|vibrant|punchy\s+colors?|boost\s+saturation|more\s+colorful)\b", c):
            return SemanticPlanResult(
                matched=True,
                intent="vibrant_color_enhancement",
                confidence=0.96,
                actions=[
                    {"type": "ADD_FILTER", "filter": "saturation", "value": 1.35},
                    {"type": "ADD_FILTER", "filter": "contrast", "value": 1.08},
                ],
                message="Boosted color vibrancy and dynamic range.",
                suggestions=["Warm up the skin tones", "Make it cinematic", "Clean up audio noise"],
                status="ok",
            )

        # "warm it up", "warmer tone", "golden hour", "sunny look"
        if re.search(r"\b(warm(er)?(\s+it|\s+this)?\s+up|warm\s+tones?|golden\s+hour|summer\s+look|sunny)\b", c):
            return SemanticPlanResult(
                matched=True,
                intent="warm_temperature_grade",
                confidence=0.94,
                actions=[
                    {"type": "ADD_FILTER", "filter": "hue", "value": 12.0},
                    {"type": "ADD_FILTER", "filter": "saturation", "value": 1.15},
                ],
                message="Applied warm golden temperature grade.",
                suggestions=["Make it cinematic", "Adjust audio boost", "Add captions"],
                status="ok",
            )

        # "cool it down", "cooler tone", "moody blue", "cyberpunk / cold"
        if re.search(r"\b(cool(er)?(\s+it|\s+this)?\s+down|cool\s+tones?|cold\s+look|blue\s+tint|moody\s+blue)\b", c):
            return SemanticPlanResult(
                matched=True,
                intent="cool_temperature_grade",
                confidence=0.94,
                actions=[
                    {"type": "ADD_FILTER", "filter": "hue", "value": -15.0},
                    {"type": "ADD_FILTER", "filter": "contrast", "value": 1.12},
                ],
                message="Applied cool atmospheric color grade.",
                suggestions=["Add cinematic filter", "Add sound effects", "Reset filters"],
                status="ok",
            )

        # "retro look", "vintage look", "90s style", "nostalgic"
        if re.search(r"\b(retro(\s+look|\s+style|\s+feel)?|vintage|90s(\s+style)?|nostalgic|old\s+school)\b", c):
            return SemanticPlanResult(
                matched=True,
                intent="apply_retro_style",
                confidence=0.96,
                actions=[
                    {"type": "SET_VISUAL_FILTER", "filter": "Retro"},
                    {"type": "ADD_FILTER", "filter": "contrast", "value": 1.05},
                ],
                message="Applied vintage retro film emulation.",
                suggestions=["Add hook caption", "Add background music", "Reset to original"],
                status="ok",
            )

        # "urban look", "modern street style", "gritty contrast"
        if re.search(r"\b(urban(\s+look|\s+style)?|gritty|street\s+style|modern\s+punch)\b", c):
            return SemanticPlanResult(
                matched=True,
                intent="apply_urban_style",
                confidence=0.96,
                actions=[
                    {"type": "SET_VISUAL_FILTER", "filter": "Urban"},
                    {"type": "ADD_FILTER", "filter": "contrast", "value": 1.20},
                    {"type": "ADD_FILTER", "filter": "saturation", "value": 0.90},
                ],
                message="Applied modern high-contrast Urban look.",
                suggestions=["Make it cinematic", "Trim silence gaps", "Export high quality"],
                status="ok",
            )

        # "reset filters", "remove all effects", "original color", "clear filters"
        if re.search(r"\b(reset\s+filters?|clear\s+filters?|remove\s+effects?|original\s+colors?|reset\s+colors?)\b", c):
            return SemanticPlanResult(
                matched=True,
                intent="reset_all_visual_adjustments",
                confidence=0.99,
                actions=[
                    {"type": "RESET_FILTER"},
                    {"type": "SET_VISUAL_FILTER", "filter": "None"},
                ],
                message="Reset all visual filters and color adjustments to default.",
                suggestions=["Make it cinematic", "Enhance lighting", "Add captions"],
                status="ok",
            )

        # ── 3. Audio & Dialogue Polish ─────────────────────────────────────────────
        # "clean up audio", "remove noise", "reduce background noise", "crisp voice"
        if re.search(r"(clean(?:\s+up)?\s+audio|remove\s+noise|noise\s+reduction|background\s+noise|fix\s+audio|crisp\s+voice)", c):
            return SemanticPlanResult(
                matched=True,
                intent="audio_noise_suppression_and_clarity",
                confidence=0.97,
                actions=[
                    {"type": "SET_NOISE_REDUCTION", "value": 75},
                    {"type": "SET_AUDIO_BOOST", "value": 130},
                ],
                message="Applied noise reduction and voice clarity boost.",
                suggestions=["Remove dead air / silences", "Add subtle background music", "Auto-generate captions"],
                status="ok",
            )

        # "boost audio", "make it louder", "audio is too quiet", "turn up volume"
        if re.search(r"\b(boost\s+audio|make\s+(it\s+)?louder|too\s+quiet|turn\s+up\s+volume|increase\s+volume)\b", c):
            return SemanticPlanResult(
                matched=True,
                intent="boost_audio_gain",
                confidence=0.96,
                actions=[
                    {"type": "SET_AUDIO_BOOST", "value": 150},
                ],
                message="Boosted audio volume to 150%.",
                suggestions=["Clean background noise", "Add fade in / out", "Remove silences"],
                status="ok",
            )

        # "mute audio", "silence audio", "remove sound"
        if re.search(r"\b(mute(\s+video|\s+audio)?|silence\s+audio|turn\s+off\s+sound)\b", c):
            return SemanticPlanResult(
                matched=True,
                intent="mute_audio",
                confidence=0.96,
                actions=[
                    {"type": "SET_AUDIO_BOOST", "value": 0},
                ],
                message="Muted video audio.",
                suggestions=["Add voiceover", "Add background music", "Unmute audio"],
                status="ok",
            )

        # "add fade in", "fade from black", "smooth start"
        if re.search(r"\b(fade\s+in|fade\s+from\s+black|smooth\s+start)\b", c):
            return SemanticPlanResult(
                matched=True,
                intent="add_fade_in_transition",
                confidence=0.95,
                actions=[
                    {"type": "ADD_FADE_IN", "clip_id": "clip-1", "duration_ms": 600.0},
                ],
                message="Added smooth fade-in at the beginning.",
                suggestions=["Add fade out at end", "Make it cinematic", "Add hook caption"],
                status="ok",
            )

        # "add fade out", "fade to black", "smooth ending"
        if re.search(r"\b(fade\s+out|fade\s+to\s+black|smooth\s+end(ing)?)\b", c):
            fade_start_ms = max(0.0, (dur - 1.0) * 1000.0)
            return SemanticPlanResult(
                matched=True,
                intent="add_fade_out_transition",
                confidence=0.95,
                actions=[
                    {"type": "ADD_FADE_OUT", "clip_id": "clip-1", "start_ms": fade_start_ms, "duration_ms": 1000.0},
                ],
                message="Added smooth fade-out at the end.",
                suggestions=["Add fade in at start", "Export Short", "Make it cinematic"],
                status="ok",
            )

        # ── 4. Temporal & Pacing Operations ────────────────────────────────────────
        # "speed up video", "make it faster", "1.25x speed", "2x speed"
        speed_match = re.search(r"(speed\s+up|faster|playback\s+speed)", c)
        if speed_match:
            factor_match = re.search(r"([0-9\.]+)\s*x", c)
            factor = float(factor_match.group(1)) if factor_match else 1.25
            speed_val = int(min(200, max(50, round(factor * 100))))
            return SemanticPlanResult(
                matched=True,
                intent="increase_playback_speed",
                confidence=0.95,
                actions=[
                    {"type": "SET_PLAYBACK_SPEED", "value": speed_val},
                ],
                message=f"Adjusted playback speed to {speed_val}%.",
                suggestions=["Tighten silence gaps", "Add captions", "Export 9:16 Short"],
                status="ok",
            )

        # "slow down video", "slow motion", "0.75x speed"
        slow_match = re.search(r"(slow\s+down|slow\s+mo(?:tion)?|half\s+speed|slower)", c)
        if slow_match:
            factor_match = re.search(r"([0-9\.]+)\s*x", c)
            factor = float(factor_match.group(1)) if factor_match else 0.75
            speed_val = int(min(200, max(50, round(factor * 100))))
            return SemanticPlanResult(
                matched=True,
                intent="decrease_playback_speed",
                confidence=0.95,
                actions=[
                    {"type": "SET_PLAYBACK_SPEED", "value": speed_val},
                ],
                message=f"Set slow-motion playback to {speed_val}%.",
                suggestions=["Add cinematic grade", "Boost audio volume", "Add fade out"],
                status="ok",
            )

        # "remove dead air", "cut silences", "tighten pacing"
        if re.search(r"\b(remove\s+(dead\s+air|silences?)|cut\s+silences?|tighten\s+pacing)\b", c):
            return SemanticPlanResult(
                matched=True,
                intent="remove_silences_and_dead_air",
                confidence=0.97,
                actions=[
                    {"type": "REMOVE_SILENCES", "min_silence_sec": 0.5, "padding_sec": 0.08},
                ],
                message="Removed dead air and tightened conversation pacing.",
                suggestions=["Clean up audio noise", "Generate animated captions", "Make it cinematic"],
                status="ok",
            )

        # ── 5. Captions & Overlays ─────────────────────────────────────────────────
        # "add captions", "turn on subtitles", "show captions"
        if re.search(r"\b(add\s+captions?|enable\s+captions?|show\s+captions?|turn\s+on\s+captions?|subtitles?)\b", c):
            return SemanticPlanResult(
                matched=True,
                intent="enable_and_style_captions",
                confidence=0.96,
                actions=[
                    {"type": "TOGGLE_CAPTIONS", "enabled": True},
                ],
                message="Enabled synchronized video captions.",
                suggestions=["Style captions", "Highlight viral moments", "Make it cinematic"],
                status="ok",
            )

        # "hide captions", "turn off subtitles", "remove captions"
        if re.search(r"\b(hide\s+captions?|disable\s+captions?|turn\s+off\s+captions?|remove\s+captions?)\b", c):
            return SemanticPlanResult(
                matched=True,
                intent="disable_captions",
                confidence=0.96,
                actions=[
                    {"type": "TOGGLE_CAPTIONS", "enabled": False},
                ],
                message="Disabled caption overlay.",
                suggestions=["Enable captions", "Make it cinematic", "Trim silence"],
                status="ok",
            )

        # No deterministic match — fall back to LLM DualModelRouter
        return None
