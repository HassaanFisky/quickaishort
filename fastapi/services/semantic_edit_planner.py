"""Deterministic fast path for unambiguous editing intents.

This is NOT a replacement for model reasoning. It is a narrow, high-precision
router that answers only the requests whose meaning is fully determined by the
words themselves. Anything carrying negation, a trade-off, or a constraint is
deferred to the DualModelRouter, because those requests need reasoning about
the media rather than a lookup.

Contract:
  plan() returns a SemanticPlanResult only when the intent is unambiguous AND
  every emitted capability is orchestrator-emit allowed in the registry.
  Otherwise it returns None, which means "defer to the model".

Design rules learned from real failures:
  * A bidirectional axis ("brightness", "speed") must resolve polarity from the
    sentence. Matching the axis noun alone inverted user intent in production
    ("reduce the brightness" brightened the clip).
  * Destructive/negating phrasing must never be absorbed by a keyword match.
  * Capability ids are validated against the single capability registry so the
    planner can never claim a capability the kernel refuses to execute.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Optional

from services.tool_registry import get_capability, is_emit_allowed

logger = logging.getLogger(__name__)

# Deterministic routing is only honest when the sentence has one reading.
# Negation and trade-off language both defeat that, so they force a model call.
_NEGATION = re.compile(
    r"\b(?:not|no|never|avoid|without|stop|don'?t|doesn'?t|isn'?t|can'?t|cannot)\b",
    re.I,
)
_CONSTRAINT = re.compile(
    r"\b(?:but|however|except|unless|while|whilst|keep|keeping|kept|preserve|"
    r"preserving|maintain|maintaining|retain|natural|naturally|without\s+losing)\b",
    re.I,
)

# Generic magnitude modifiers. Axis-intrinsic comparatives (brighter, slower)
# are handled separately because they carry their own direction.
_DECREASE = re.compile(
    r"\b(?:less|lower|reduce[sd]?|reducing|decrease[sd]?|decreasing|"
    r"tone\s+down|dial\s+back|cut\s+back|pull\s+back|soften)\b",
    re.I,
)
_INCREASE = re.compile(
    r"\b(?:more|increase[sd]?|increasing|boost(?:ed|ing)?|raise|amplify|"
    r"crank|punch\s+up)\b",
    re.I,
)


@dataclass
class SemanticPlanResult:
    matched: bool
    intent: str
    confidence: float
    actions: list[dict[str, Any]] = field(default_factory=list)
    message: str = ""
    suggestions: list[str] = field(default_factory=list)
    status: str = "ok"


def _defer(command: str) -> bool:
    """True when the sentence needs reasoning rather than keyword routing."""
    return bool(_NEGATION.search(command) or _CONSTRAINT.search(command))


def _axis_direction(
    command: str,
    *,
    intrinsic_up: str,
    intrinsic_down: str,
    axis_up: str,
    axis_down: str,
) -> Optional[int]:
    """Resolve +1 / -1 on a bidirectional axis, or None when ambiguous.

    Intrinsic comparatives ("brighter", "slower") set direction directly.
    Otherwise the axis noun supplies a base polarity and a generic modifier
    ("reduce", "more") may invert it — so "reduce the brightness" darkens and
    "less dark" brightens.
    """
    up = re.search(intrinsic_up, command, re.I)
    down = re.search(intrinsic_down, command, re.I)
    if up and down:
        return None
    if up:
        return 1
    if down:
        return -1

    noun_up = re.search(axis_up, command, re.I)
    noun_down = re.search(axis_down, command, re.I)
    if bool(noun_up) == bool(noun_down):
        return None  # neither axis noun, or both — not determinable

    base = 1 if noun_up else -1
    dec = _DECREASE.search(command)
    inc = _INCREASE.search(command)
    if dec and inc:
        return None
    if dec:
        return -base
    if inc:
        return base
    return None  # bare noun with no modifier says nothing about direction


def _emittable(actions: list[dict[str, Any]]) -> bool:
    """Every action must be a real, orchestrator-emit-allowed capability."""
    for action in actions:
        cid = action.get("type")
        if not isinstance(cid, str) or get_capability(cid) is None:
            logger.warning("semantic_planner_unknown_capability id=%s", cid)
            return False
        if not is_emit_allowed(cid):
            logger.warning("semantic_planner_emit_blocked id=%s", cid)
            return False
    return True


def _result(
    intent: str,
    actions: list[dict[str, Any]],
    message: str,
    suggestions: list[str],
    confidence: float = 0.9,
) -> Optional[SemanticPlanResult]:
    if not _emittable(actions):
        return None
    return SemanticPlanResult(
        matched=True,
        intent=intent,
        confidence=confidence,
        actions=actions,
        message=message,
        suggestions=suggestions,
        status="ok",
    )


class SemanticEditPlanner:
    """Narrow deterministic router. Defers to the model whenever unsure."""

    @classmethod
    def plan(
        cls,
        command: str,
        context: Optional[dict[str, Any]] = None,
    ) -> Optional[SemanticPlanResult]:
        c = " ".join(str(command or "").split()).lower()
        if not c:
            return None

        # Trade-offs and negations are exactly the cases a lookup gets wrong.
        if _defer(c):
            logger.debug("semantic_planner_deferred reason=polarity_or_constraint")
            return None

        ctx = context or {}
        duration = _duration_from_context(ctx)

        # ── Captions ─────────────────────────────────────────────────────────
        # Disable is checked first: "remove the captions" also contains "captions".
        if re.search(r"\b(?:caption|captions|subtitle|subtitles)\b", c):
            if re.search(r"\b(?:hide|remove|disable|off|drop|clear)\b", c):
                return _result(
                    "disable_captions",
                    [{"type": "TOGGLE_CAPTIONS", "enabled": False}],
                    "Turned captions off.",
                    ["Turn captions back on", "Trim silence", "Export a 9:16 short"],
                    confidence=0.93,
                )
            if re.search(r"\b(?:add|enable|show|on|generate|turn\s+on)\b", c):
                return _result(
                    "enable_captions",
                    [{"type": "TOGGLE_CAPTIONS", "enabled": True}],
                    "Turned captions on.",
                    ["Restyle the captions", "Trim silence", "Export a 9:16 short"],
                    confidence=0.93,
                )
            return None

        # ── Reset ────────────────────────────────────────────────────────────
        if re.search(
            r"\b(?:reset|clear)\s+(?:the\s+)?(?:filters?|colors?|colours?|grade|look)\b",
            c,
        ) or re.search(r"\brevert\s+(?:the\s+)?(?:colors?|grade|look)\b", c):
            return _result(
                "reset_visual_adjustments",
                [
                    {"type": "RESET_FILTER"},
                    {"type": "SET_VISUAL_FILTER", "filter": "None"},
                ],
                "Cleared colour adjustments and filter presets.",
                ["Apply a cinematic grade", "Brighten the shot", "Add captions"],
                confidence=0.95,
            )

        # ── Style presets — single-direction, no polarity to resolve ─────────
        preset = _preset_from_command(c)
        if preset:
            name, intent = preset
            return _result(
                intent,
                [{"type": "SET_VISUAL_FILTER", "filter": name}],
                f"Applied the {name} look.",
                ["Fine-tune brightness", "Clean up the audio", "Export a 9:16 short"],
                confidence=0.9,
            )

        # ── Brightness / exposure ────────────────────────────────────────────
        brightness_dir = _axis_direction(
            c,
            intrinsic_up=r"\b(?:brighter|brighten|too\s+dark|under\s?exposed)\b",
            intrinsic_down=r"\b(?:darker|darken|too\s+bright|over\s?exposed|washed\s+out)\b",
            axis_up=r"\b(?:bright|brightness|exposure|lighting)\b",
            axis_down=r"\b(?:dark|darkness|shadows?)\b",
        )
        if brightness_dir is not None:
            value = 1.2 if brightness_dir > 0 else 0.85
            word = "Brightened" if brightness_dir > 0 else "Darkened"
            return _result(
                "brighten_clip" if brightness_dir > 0 else "darken_clip",
                [{"type": "ADD_FILTER", "filter": "brightness", "value": value}],
                f"{word} the clip.",
                [
                    "Adjust contrast",
                    "Apply a cinematic grade",
                    "Clean up the audio",
                ],
                confidence=0.88,
            )

        # ── Saturation ───────────────────────────────────────────────────────
        saturation_dir = _axis_direction(
            c,
            intrinsic_up=r"\b(?:colou?rs?\s+pop|vibrant|punchier|more\s+colou?rful)\b",
            intrinsic_down=r"\b(?:desaturate[d]?|muted\s+colou?rs?|washed\s+out\s+colou?rs?)\b",
            axis_up=r"\b(?:saturation|vibrance|colou?r|colou?rs)\b",
            axis_down=r"\b(?:greyscale|grayscale|monochrome)\b",
        )
        if saturation_dir is not None:
            value = 1.3 if saturation_dir > 0 else 0.7
            word = "Boosted" if saturation_dir > 0 else "Reduced"
            return _result(
                "increase_saturation" if saturation_dir > 0 else "decrease_saturation",
                [{"type": "ADD_FILTER", "filter": "saturation", "value": value}],
                f"{word} colour saturation.",
                ["Apply a cinematic grade", "Adjust brightness", "Add captions"],
                confidence=0.86,
            )

        # ── Playback speed ───────────────────────────────────────────────────
        speed_dir = _axis_direction(
            c,
            intrinsic_up=r"\b(?:faster|quicker|sped\s+up|speed\s+(?:\w+\s+){0,2}up)\b",
            intrinsic_down=r"\b(?:slower|slow\s+mo(?:tion)?|half\s+speed|"
            r"slow\s+(?:\w+\s+){0,2}down)\b",
            axis_up=r"\b(?:speed|pace|tempo)\b",
            axis_down=r"(?!)",  # no decrease-polarity noun for this axis
        )
        if speed_dir is not None:
            explicit = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*x\b", c)
            if explicit:
                factor = float(explicit.group(1))
            else:
                factor = 1.25 if speed_dir > 0 else 0.75
            value = int(min(200, max(50, round(factor * 100))))
            return _result(
                "set_playback_speed",
                [{"type": "SET_PLAYBACK_SPEED", "value": value}],
                f"Set playback speed to {value}%.",
                ["Trim silence", "Add captions", "Export a 9:16 short"],
                confidence=0.9,
            )

        # ── Audio ────────────────────────────────────────────────────────────
        if re.search(r"\b(?:mute|silence\s+the\s+audio)\b", c):
            return _result(
                "mute_audio",
                [{"type": "SET_AUDIO_BOOST", "value": 0}],
                "Muted the audio.",
                ["Restore audio", "Add background music", "Add captions"],
                confidence=0.93,
            )

        # Noise cleanup is single-direction: "reduce noise" and "remove noise"
        # both mean more suppression, so no polarity inversion is possible.
        if re.search(r"\b(?:noise|hiss|hum)\b", c) and re.search(
            r"\b(?:clean|remove|reduce|suppress|kill|cut|fix)\b", c
        ):
            return _result(
                "suppress_background_noise",
                [{"type": "SET_NOISE_REDUCTION", "value": 75}],
                "Applied background-noise suppression.",
                ["Raise the dialogue level", "Trim silence", "Add captions"],
                confidence=0.9,
            )

        volume_dir = _axis_direction(
            c,
            intrinsic_up=r"\b(?:louder|turn\s+it\s+up|too\s+quiet|too\s+low)\b",
            intrinsic_down=r"\b(?:quieter|turn\s+it\s+down|too\s+loud)\b",
            axis_up=r"\b(?:volume|loudness|gain|audio\s+level)\b",
            axis_down=r"(?!)",
        )
        if volume_dir is not None:
            value = 130 if volume_dir > 0 else 60
            word = "Raised" if volume_dir > 0 else "Lowered"
            return _result(
                "set_audio_gain",
                [{"type": "SET_AUDIO_BOOST", "value": value}],
                f"{word} the audio level.",
                ["Suppress background noise", "Trim silence", "Add captions"],
                confidence=0.88,
            )

        # ── Pacing ───────────────────────────────────────────────────────────
        if re.search(r"\b(?:dead\s*air|silences?|silent\s+gaps?)\b", c) and re.search(
            r"\b(?:remove|cut|trim|tighten|delete|strip)\b", c
        ):
            return _result(
                "remove_silences",
                [
                    {
                        "type": "REMOVE_SILENCES",
                        "min_silence_sec": 0.5,
                        "padding_sec": 0.08,
                    }
                ],
                "Removed dead air and tightened the pacing.",
                ["Clean up the audio", "Add captions", "Export a 9:16 short"],
                confidence=0.92,
            )

        _ = duration  # reserved for context-aware planning; unused today
        return None


def _duration_from_context(ctx: dict[str, Any]) -> float:
    for key in ("videoDuration", "duration", "video_duration"):
        raw = ctx.get(key)
        try:
            value = float(raw)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            continue
        if value > 0:
            return value
    return 0.0


def _preset_from_command(c: str) -> Optional[tuple[str, str]]:
    if re.search(r"\b(?:cinematic|movie\s+look|film\s+look|hollywood)\b", c):
        return "Cinematic", "apply_cinematic_preset"
    if re.search(r"\b(?:retro|vintage|nostalgic|old\s+school)\b", c):
        return "Retro", "apply_retro_preset"
    if re.search(r"\b(?:urban|gritty|street\s+style)\b", c):
        return "Urban", "apply_urban_preset"
    return None
