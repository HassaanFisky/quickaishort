"""Server-side clamping moat for AI Editor actions.

Every action from the Gemini bridge passes through sanitise() before being
returned to the client.  This ensures:
  - All timestamps are clamped to [0, video_duration].
  - All canvas positions are clamped to the 1080×1920 reference canvas.
  - Numeric slider values remain within their declared ranges.
  - Actions referencing impossible states (e.g. split past end) are dropped.

Also provides a deterministic mock provider (MOCK_AI_EDITOR=true) used in
development and CI to avoid spending Gemini quota.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from services.tool_registry import get_capability, is_emit_allowed

from models.ai_editor import (  # noqa: F401
    AIEditorCurrentState,
    AiEditorAction,
    AddCaptionAction,
    TrimAction,
    SplitClipAction,
    SeekAction,
    AddFilterAction,
    SetVisualFilterAction,
    SetAudioBoostAction,
    SetNoiseReductionAction,
    SetPlaybackSpeedAction,
    AddElementAction,
    UpdateElementAction,
    TextElementData,
    DetectViralMomentsAction,
    ViralMoment,
    GenerateHookCaptionAction,
    SuggestStylePresetAction,
    ExplainLastEditAction,  # noqa: F401 — used as inline type comment
    AddBRollAction,
    AddVideoOverlayAction,
    RemoveOverlayAction,  # noqa: F401 — used as inline type comment
    RemoveSilencesAction,
    BladeSplitAction,
    RippleTrimAction,
    RollingTrimAction,
    SlipAction,
    SlideAction,
    DurationStretchAction,
    MarkInAction,
    MarkOutAction,
    RangeMarkAction,
    InsertEditAction,
    OverwriteEditAction,
    TimelineZoomAction,
    ApplyLutAction,
    HslSecondariesAction,
    SetClipGainAction,
    SetMasterGainAction,
    AddFadeInAction,
    AddFadeOutAction,
    AddRectMaskAction,
    AddEllipseMaskAction,
    AddBezierMaskAction,
)

logger = logging.getLogger(__name__)

MOCK_ENABLED = os.getenv("MOCK_AI_EDITOR", "false").lower() == "true"

# Reference canvas dimensions (1080p portrait)
_CANVAS_W = 1080.0
_CANVAS_H = 1920.0


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _clamp_time(t: float, duration: float) -> float:
    return _clamp(t, 0.0, max(duration, 0.0))


def _clamp_x(x: float) -> float:
    return _clamp(x, 0.0, _CANVAS_W)


def _clamp_y(y: float) -> float:
    return _clamp(y, 0.0, _CANVAS_H)


def sanitise(
    actions: list[AiEditorAction],
    state: AIEditorCurrentState,
    *,
    enforce_emit_policy: bool = True,
) -> tuple[list[AiEditorAction], list[str], list[str]]:
    """Clamp or drop actions that are out of range.

    Args:
        enforce_emit_policy: When True (production default), drop unknown ids and
            capabilities with orchestrator_emit=false (EP-001). Set False only in
            unit tests that exercise clamp logic for schema-only tools.

    Returns:
        (safe_actions, clamped_descriptions, dropped_descriptions)
    """
    safe: list[AiEditorAction] = []
    clamped: list[str] = []
    dropped: list[str] = []
    dur = state.videoDuration

    for action in actions:
        t = action.type

        # ── EP-001 Capability Registry emit gate (fail closed) ───────────────
        if enforce_emit_policy:
            cap = get_capability(t)
            if cap is None:
                logger.warning("sanitiser_unknown_capability id=%s", t)
                dropped.append(f"unknown_capability:{t}")
                continue
            if not is_emit_allowed(t):
                logger.info("sanitiser_emit_blocked id=%s", t)
                dropped.append(f"emit_blocked:{t}")
                continue

        # ── Caption timestamps ────────────────────────────────────────────────
        if t == "ADD_CAPTION":
            a = action  # type: AddCaptionAction
            orig_start, orig_end = a.startTime, a.endTime
            new_start = _clamp_time(a.startTime, dur)
            new_end = _clamp_time(a.endTime, dur)
            if new_end <= new_start:
                dropped.append(
                    f"ADD_CAPTION startTime={orig_start:.1f} endTime={orig_end:.1f} — zero-length after clamp"
                )
                continue
            if new_start != orig_start or new_end != orig_end:
                clamped.append(
                    f"ADD_CAPTION startTime {orig_start:.1f}→{new_start:.1f}, endTime {orig_end:.1f}→{new_end:.1f}"
                )
                action = AddCaptionAction(
                    type="ADD_CAPTION",
                    text=a.text,
                    startTime=new_start,
                    endTime=new_end,
                    style=a.style,
                )

        # ── TRIM ──────────────────────────────────────────────────────────────
        elif t == "TRIM":
            a = action  # type: TrimAction
            ns = _clamp_time(a.start, dur)
            ne = _clamp_time(a.end, dur)
            if ne <= ns:
                dropped.append(
                    f"TRIM start={a.start:.1f} end={a.end:.1f} — invalid range after clamp"
                )
                continue
            if ns != a.start or ne != a.end:
                clamped.append(
                    f"TRIM start {a.start:.1f}→{ns:.1f}, end {a.end:.1f}→{ne:.1f}"
                )
                action = TrimAction(type="TRIM", start=ns, end=ne)

        # ── SPLIT_CLIP ────────────────────────────────────────────────────────
        elif t == "SPLIT_CLIP":
            a = action  # type: SplitClipAction
            nt = _clamp_time(a.time, dur)
            if nt <= 1.0 or nt >= dur - 1.0:
                dropped.append(
                    f"SPLIT_CLIP time={a.time:.1f} — too close to edge after clamp"
                )
                continue
            if nt != a.time:
                clamped.append(f"SPLIT_CLIP time {a.time:.1f}→{nt:.1f}")
                action = SplitClipAction(type="SPLIT_CLIP", time=nt)

        # ── SEEK ─────────────────────────────────────────────────────────────
        elif t == "SEEK":
            a = action  # type: SeekAction
            nt = _clamp_time(a.time, dur)
            if nt != a.time:
                clamped.append(f"SEEK time {a.time:.1f}→{nt:.1f}")
                action = SeekAction(type="SEEK", time=nt)

        # ── ADD_FILTER ────────────────────────────────────────────────────────
        elif t == "ADD_FILTER":
            a = action  # type: AddFilterAction
            ranges = {
                "brightness": (0.5, 2.0),
                "contrast": (0.5, 2.0),
                "saturation": (0.0, 2.0),
                "hue": (-180.0, 180.0),
                "blur": (0.0, 10.0),
            }
            lo, hi = ranges.get(a.filter, (0.0, 10.0))
            nv = _clamp(a.value, lo, hi)
            if nv != a.value:
                clamped.append(f"ADD_FILTER {a.filter} value {a.value:.2f}→{nv:.2f}")
                action = AddFilterAction(type="ADD_FILTER", filter=a.filter, value=nv)

        # ── Audio / speed sliders ─────────────────────────────────────────────
        elif t == "SET_AUDIO_BOOST":
            a = action  # type: SetAudioBoostAction
            nv = int(_clamp(a.value, 0, 200))
            if nv != a.value:
                clamped.append(f"SET_AUDIO_BOOST value {a.value}→{nv}")
                action = SetAudioBoostAction(type="SET_AUDIO_BOOST", value=nv)
        elif t == "SET_NOISE_REDUCTION":
            a = action  # type: SetNoiseReductionAction
            nv = int(_clamp(a.value, 0, 100))
            if nv != a.value:
                clamped.append(f"SET_NOISE_REDUCTION value {a.value}→{nv}")
                action = SetNoiseReductionAction(type="SET_NOISE_REDUCTION", value=nv)
        elif t == "SET_PLAYBACK_SPEED":
            a = action  # type: SetPlaybackSpeedAction
            nv = int(_clamp(a.value, 50, 200))
            if nv != a.value:
                clamped.append(f"SET_PLAYBACK_SPEED value {a.value}→{nv}")
                action = SetPlaybackSpeedAction(type="SET_PLAYBACK_SPEED", value=nv)

        # ── ADD_ELEMENT — clamp canvas position ───────────────────────────────
        elif t == "ADD_ELEMENT":
            a = action  # type: AddElementAction
            el = a.element
            el_dict = el.model_dump()
            nx = _clamp_x(el_dict.get("x", 540.0))
            ny = _clamp_y(el_dict.get("y", 960.0))
            pos_changed = nx != el_dict.get("x") or ny != el_dict.get("y")
            if pos_changed:
                clamped.append(
                    f"ADD_ELEMENT {el.type} position clamped to canvas bounds"
                )
                el_dict["x"] = nx
                el_dict["y"] = ny
                # Reconstruct with clamped coords
                from models.ai_editor import EditorElementData
                from pydantic import TypeAdapter

                ta: TypeAdapter[Any] = TypeAdapter(EditorElementData)
                new_el = ta.validate_python(el_dict)
                action = AddElementAction(type="ADD_ELEMENT", element=new_el)

            # Drop ADD_ELEMENT TEXT with empty text
            if el.type == "TEXT" and not getattr(el, "text", "").strip():
                dropped.append("ADD_ELEMENT TEXT with empty text dropped")
                continue

        # ── UPDATE_ELEMENT — clamp patch position if present ─────────────────
        elif t == "UPDATE_ELEMENT":
            a = action  # type: UpdateElementAction
            patch: dict[str, Any] = dict(a.patch)
            patched = False
            if "x" in patch:
                nx = _clamp_x(float(patch["x"]))
                if nx != patch["x"]:
                    patch["x"] = nx
                    patched = True
            if "y" in patch:
                ny = _clamp_y(float(patch["y"]))
                if ny != patch["y"]:
                    patch["y"] = ny
                    patched = True
            if patched:
                clamped.append(f"UPDATE_ELEMENT {a.id} position clamped")
                action = UpdateElementAction(
                    type="UPDATE_ELEMENT", id=a.id, patch=patch
                )

        # ── DETECT_VIRAL_MOMENTS — clamp moment timestamps ────────────────────
        elif t == "DETECT_VIRAL_MOMENTS":
            a = action  # type: DetectViralMomentsAction
            valid_moments = []
            for m in a.moments:
                if not m.hook.strip():
                    dropped.append(
                        f"DETECT_VIRAL_MOMENTS moment at {m.timestamp:.1f}s dropped — empty hook"
                    )
                    continue
                clamped_ts = _clamp_time(m.timestamp, dur)
                if clamped_ts != m.timestamp:
                    clamped.append(
                        f"DETECT_VIRAL_MOMENTS moment timestamp {m.timestamp:.1f}→{clamped_ts:.1f}"
                    )
                valid_moments.append(
                    ViralMoment(timestamp=clamped_ts, hook=m.hook, score=m.score)
                )
            if not valid_moments:
                dropped.append("DETECT_VIRAL_MOMENTS dropped — no valid moments")
                continue
            action = DetectViralMomentsAction(
                type="DETECT_VIRAL_MOMENTS", moments=valid_moments
            )

        # ── GENERATE_HOOK_CAPTION — drop empty caption strings ────────────────
        elif t == "GENERATE_HOOK_CAPTION":
            a = action  # type: GenerateHookCaptionAction
            valid_captions = [c for c in a.captions if c.strip()]
            if not valid_captions:
                dropped.append(
                    "GENERATE_HOOK_CAPTION dropped — all captions were empty"
                )
                continue
            action = GenerateHookCaptionAction(
                type="GENERATE_HOOK_CAPTION", captions=valid_captions
            )

        # ── SUGGEST_STYLE_PRESET — recursively sanitise nested actions ────────
        elif t == "SUGGEST_STYLE_PRESET":
            a = action  # type: SuggestStylePresetAction
            safe_nested, nested_clamped, nested_dropped = sanitise(a.actions, state)
            clamped.extend(nested_clamped)
            dropped.extend(nested_dropped)
            action = SuggestStylePresetAction(
                type="SUGGEST_STYLE_PRESET",
                preset=a.preset,
                reason=a.reason,
                actions=safe_nested,
            )

        # ── EXPLAIN_LAST_EDIT — pass-through (freeform text) ─────────────────
        elif t == "EXPLAIN_LAST_EDIT":
            a = action  # type: ExplainLastEditAction
            if not a.explanation.strip():
                dropped.append("EXPLAIN_LAST_EDIT dropped — empty explanation")
                continue

        # ── ADD_BROLL — clamp start/duration to video bounds ─────────────────
        elif t == "ADD_BROLL":
            a = action  # type: AddBRollAction
            ns = _clamp_time(a.start_sec, dur)
            max_dur = max(0.0, dur - ns)
            nd = _clamp(a.duration_sec, 0.0, max_dur)
            no = _clamp(a.opacity, 0.1, 1.0)
            changed = ns != a.start_sec or nd != a.duration_sec or no != a.opacity
            if nd < 0.5:
                dropped.append(
                    f"ADD_BROLL pexels_id={a.pexels_id} dropped — duration {nd:.2f}s < 0.5s after clamp"
                )
                continue
            if changed:
                clamped.append(
                    f"ADD_BROLL pexels_id={a.pexels_id} start {a.start_sec:.1f}→{ns:.1f}"
                    f" dur {a.duration_sec:.1f}→{nd:.1f}"
                )
                action = AddBRollAction(
                    type="ADD_BROLL",
                    pexels_id=a.pexels_id,
                    download_url=a.download_url,
                    thumbnail_url=a.thumbnail_url,
                    title=a.title,
                    start_sec=ns,
                    duration_sec=nd,
                    position=a.position,
                    opacity=no,
                )

        # ── ADD_VIDEO_OVERLAY — same timestamp clamping ───────────────────────
        elif t == "ADD_VIDEO_OVERLAY":
            a = action  # type: AddVideoOverlayAction
            ns = _clamp_time(a.start_sec, dur)
            max_dur = max(0.0, dur - ns)
            nd = _clamp(a.duration_sec, 0.0, max_dur)
            no = _clamp(a.opacity, 0.1, 1.0)
            changed = ns != a.start_sec or nd != a.duration_sec or no != a.opacity
            if nd < 0.5:
                dropped.append(
                    f"ADD_VIDEO_OVERLAY dropped — duration {nd:.2f}s < 0.5s after clamp"
                )
                continue
            if changed:
                clamped.append(
                    f"ADD_VIDEO_OVERLAY start {a.start_sec:.1f}→{ns:.1f}"
                    f" dur {a.duration_sec:.1f}→{nd:.1f}"
                )
                action = AddVideoOverlayAction(
                    type="ADD_VIDEO_OVERLAY",
                    source_url=a.source_url,
                    start_sec=ns,
                    duration_sec=nd,
                    position=a.position,
                    opacity=no,
                    mute_audio=a.mute_audio,
                )

        # ── REMOVE_OVERLAY — pass-through (frontend ignores unknown id) ───────
        elif t == "REMOVE_OVERLAY":
            pass  # type: RemoveOverlayAction — no clamping needed

        # ── REMOVE_SILENCES — clamp floats, enforce safety rail ───────────────
        elif t == "REMOVE_SILENCES":
            a = action  # type: RemoveSilencesAction
            nm = _clamp(a.min_silence_sec, 0.2, 5.0)
            np_ = _clamp(a.padding_sec, 0.0, 1.0)
            changed = nm != a.min_silence_sec or np_ != a.padding_sec
            if changed:
                clamped.append(
                    f"REMOVE_SILENCES min_silence_sec {a.min_silence_sec:.2f}→{nm:.2f}"
                    f" padding_sec {a.padding_sec:.2f}→{np_:.2f}"
                )
                action = RemoveSilencesAction(
                    type="REMOVE_SILENCES",
                    min_silence_sec=nm,
                    padding_sec=np_,
                )

        # ── POINTER_SELECT — pass-through (no numeric fields) ─────────────────
        elif t == "POINTER_SELECT":
            pass  # clip_id is optional; no clamping needed

        # ── BLADE_SPLIT — clamp split time to video bounds ────────────────────
        elif t == "BLADE_SPLIT":
            a = action  # type: BladeSplitAction
            nt = _clamp_time(a.time_sec, dur)
            if nt <= 1.0 or nt >= dur - 1.0:
                dropped.append(
                    f"BLADE_SPLIT time_sec={a.time_sec:.1f} — too close to edge after clamp"
                )
                continue
            if nt != a.time_sec:
                clamped.append(f"BLADE_SPLIT time_sec {a.time_sec:.1f}→{nt:.1f}")
                action = BladeSplitAction(type="BLADE_SPLIT", time_sec=nt)

        # ── RIPPLE_TRIM — clamp delta to ±duration ────────────────────────────
        elif t == "RIPPLE_TRIM":
            a = action  # type: RippleTrimAction
            nd = _clamp(a.delta_sec, -dur, dur)
            if nd != a.delta_sec:
                clamped.append(f"RIPPLE_TRIM delta_sec {a.delta_sec:.2f}→{nd:.2f}")
                action = RippleTrimAction(
                    type="RIPPLE_TRIM", clip_id=a.clip_id, edge=a.edge, delta_sec=nd
                )

        # ── ROLLING_TRIM — clamp delta ─────────────────────────────────────────
        elif t == "ROLLING_TRIM":
            a = action  # type: RollingTrimAction
            nd = _clamp(a.delta_sec, -dur, dur)
            if nd != a.delta_sec:
                clamped.append(f"ROLLING_TRIM delta_sec {a.delta_sec:.2f}→{nd:.2f}")
                action = RollingTrimAction(
                    type="ROLLING_TRIM",
                    clip_id=a.clip_id,
                    neighbor_id=a.neighbor_id,
                    edge=a.edge,
                    delta_sec=nd,
                )

        # ── SLIP_CLIP — clamp delta ────────────────────────────────────────────
        elif t == "SLIP_CLIP":
            a = action  # type: SlipAction
            nd = _clamp(a.delta_sec, -dur, dur)
            if nd != a.delta_sec:
                clamped.append(f"SLIP_CLIP delta_sec {a.delta_sec:.2f}→{nd:.2f}")
                action = SlipAction(type="SLIP_CLIP", clip_id=a.clip_id, delta_sec=nd)

        # ── SLIDE_CLIP — clamp delta ───────────────────────────────────────────
        elif t == "SLIDE_CLIP":
            a = action  # type: SlideAction
            nd = _clamp(a.delta_sec, -dur, dur)
            if nd != a.delta_sec:
                clamped.append(f"SLIDE_CLIP delta_sec {a.delta_sec:.2f}→{nd:.2f}")
                action = SlideAction(type="SLIDE_CLIP", clip_id=a.clip_id, delta_sec=nd)

        # ── RIPPLE_DELETE — pass-through (no numeric fields) ──────────────────
        elif t == "RIPPLE_DELETE":
            pass  # clip_id validated by Pydantic; no clamping needed

        # ── DURATION_STRETCH — clamp speed_factor and target_duration ─────────
        elif t == "DURATION_STRETCH":
            a = action  # type: DurationStretchAction
            ntd = (
                _clamp(a.target_duration_sec, 0.1, dur * 4)
                if a.target_duration_sec is not None
                else None
            )
            nsf = (
                _clamp(a.speed_factor, 0.1, 10.0)
                if a.speed_factor is not None
                else None
            )
            changed = ntd != a.target_duration_sec or nsf != a.speed_factor
            if changed:
                clamped.append(f"DURATION_STRETCH values clamped for clip {a.clip_id}")
                action = DurationStretchAction(
                    type="DURATION_STRETCH",
                    clip_id=a.clip_id,
                    target_duration_sec=ntd,
                    speed_factor=nsf,
                )

        # ── FORWARD_LANE_SELECT / BACKWARD_LANE_SELECT — pass-through ────────
        elif t in ("FORWARD_LANE_SELECT", "BACKWARD_LANE_SELECT"):
            pass

        # ── MARK_IN — clamp to [0, dur] ───────────────────────────────────────
        elif t == "MARK_IN":
            a = action  # type: MarkInAction
            ct = _clamp(a.time_sec, 0.0, dur)
            if ct != a.time_sec:
                clamped.append(f"MARK_IN time clamped to {ct:.3f}")
                action = MarkInAction(type="MARK_IN", time_sec=ct)

        # ── MARK_OUT — clamp to [0, dur] ──────────────────────────────────────
        elif t == "MARK_OUT":
            a = action  # type: MarkOutAction
            ct = _clamp(a.time_sec, 0.0, dur)
            if ct != a.time_sec:
                clamped.append(f"MARK_OUT time clamped to {ct:.3f}")
                action = MarkOutAction(type="MARK_OUT", time_sec=ct)

        # ── CLIP_RANGE_MARK — pass-through ────────────────────────────────────
        elif t == "CLIP_RANGE_MARK":
            pass

        # ── RANGE_MARK — clamp in/out, drop if in >= out ──────────────────────
        elif t == "RANGE_MARK":
            a = action  # type: RangeMarkAction
            ni = _clamp(a.in_sec, 0.0, dur)
            no = _clamp(a.out_sec, 0.0, dur)
            if no <= ni:
                dropped.append(f"RANGE_MARK dropped (in {ni:.3f} >= out {no:.3f})")
                continue
            if ni != a.in_sec or no != a.out_sec:
                clamped.append("RANGE_MARK in/out clamped")
                action = RangeMarkAction(type="RANGE_MARK", in_sec=ni, out_sec=no)

        # ── EXTRACT / LIFT — pass-through ─────────────────────────────────────
        elif t in ("EXTRACT", "LIFT"):
            pass

        # ── INSERT_EDIT — clamp insert time ───────────────────────────────────
        elif t == "INSERT_EDIT":
            a = action  # type: InsertEditAction
            ct = _clamp(a.insert_time_sec, 0.0, dur)
            if ct != a.insert_time_sec:
                clamped.append(f"INSERT_EDIT time clamped to {ct:.3f}")
                action = InsertEditAction(
                    type="INSERT_EDIT", clip_id=a.clip_id, insert_time_sec=ct
                )

        # ── OVERWRITE_EDIT — clamp insert time ────────────────────────────────
        elif t == "OVERWRITE_EDIT":
            a = action  # type: OverwriteEditAction
            ct = _clamp(a.insert_time_sec, 0.0, dur)
            if ct != a.insert_time_sec:
                clamped.append(f"OVERWRITE_EDIT time clamped to {ct:.3f}")
                action = OverwriteEditAction(
                    type="OVERWRITE_EDIT", clip_id=a.clip_id, insert_time_sec=ct
                )

        # ── SWAP_CLIP — pass-through ──────────────────────────────────────────
        elif t == "SWAP_CLIP":
            pass

        # ── SCROLL_HAND — pass-through (Pydantic already bounds delta) ────────
        elif t == "SCROLL_HAND":
            pass

        # ── TIMELINE_ZOOM — clamp zoom_factor ────────────────────────────────
        elif t == "TIMELINE_ZOOM":
            a = action  # type: TimelineZoomAction
            nz = _clamp(a.zoom_factor, 0.1, 10.0)
            if nz != a.zoom_factor:
                clamped.append(f"TIMELINE_ZOOM factor clamped to {nz:.2f}")
                action = TimelineZoomAction(type="TIMELINE_ZOOM", zoom_factor=nz)

        # ── MAGNETIC_SNAP_TOGGLE — pass-through ───────────────────────────────
        elif t == "MAGNETIC_SNAP_TOGGLE":
            pass

        # ── COLOR_WHEELS — pass-through (Pydantic bounds each channel) ────────
        elif t == "COLOR_WHEELS":
            pass

        # ── COLOR_CURVES — pass-through (Pydantic bounds x/y to [0,1]) ───────
        elif t == "COLOR_CURVES":
            pass

        # ── HSL_SECONDARIES — clamp adjustments to declared ranges ────────────
        elif t == "HSL_SECONDARIES":
            a = action  # type: HslSecondariesAction
            nh = _clamp(a.hue_shift, -180.0, 180.0)
            ns = _clamp(a.saturation_adjust, -100.0, 100.0)
            nl = _clamp(a.luminance_adjust, -100.0, 100.0)
            changed = (
                nh != a.hue_shift
                or ns != a.saturation_adjust
                or nl != a.luminance_adjust
            )
            if changed:
                clamped.append(f"HSL_SECONDARIES values clamped for clip {a.clip_id}")
                action = HslSecondariesAction(
                    type="HSL_SECONDARIES",
                    clip_id=a.clip_id,
                    hue_shift=nh,
                    saturation_adjust=ns,
                    luminance_adjust=nl,
                    qualifier_hue=a.qualifier_hue,
                    qualifier_range=a.qualifier_range,
                )

        # ── APPLY_LUT — clamp intensity to [0,1] ─────────────────────────────
        elif t == "APPLY_LUT":
            a = action  # type: ApplyLutAction
            ni = _clamp(a.intensity, 0.0, 1.0)
            if ni != a.intensity:
                clamped.append(f"APPLY_LUT intensity clamped to {ni:.3f}")
                action = ApplyLutAction(
                    type="APPLY_LUT",
                    clip_id=a.clip_id,
                    lut_url=a.lut_url,
                    lut_size=a.lut_size,
                    intensity=ni,
                )

        # ── RESET_COLOR — pass-through ────────────────────────────────────────
        elif t == "RESET_COLOR":
            pass

        # ── SET_CLIP_GAIN — clamp to [-60, 20] dB ────────────────────────────
        elif t == "SET_CLIP_GAIN":
            a = action  # type: SetClipGainAction
            ng = _clamp(a.gain_db, -60.0, 20.0)
            if ng != a.gain_db:
                clamped.append(f"SET_CLIP_GAIN gain_db clamped to {ng:.1f}")
                action = SetClipGainAction(
                    type="SET_CLIP_GAIN", clip_id=a.clip_id, gain_db=ng
                )

        # ── SET_MASTER_GAIN — clamp to [-60, 20] dB ──────────────────────────
        elif t == "SET_MASTER_GAIN":
            a = action  # type: SetMasterGainAction
            ng = _clamp(a.gain_db, -60.0, 20.0)
            if ng != a.gain_db:
                clamped.append(f"SET_MASTER_GAIN gain_db clamped to {ng:.1f}")
                action = SetMasterGainAction(type="SET_MASTER_GAIN", gain_db=ng)

        # ── ENABLE_DENOISE / ENABLE_LIMITER — pass-through ───────────────────
        elif t in ("ENABLE_DENOISE", "ENABLE_LIMITER"):
            pass

        # ── ADD_FADE_IN — clamp duration_ms ──────────────────────────────────
        elif t == "ADD_FADE_IN":
            a = action  # type: AddFadeInAction
            nd = _clamp(a.duration_ms, 10.0, 10000.0)
            if nd != a.duration_ms:
                clamped.append(f"ADD_FADE_IN duration_ms clamped to {nd:.0f}")
                action = AddFadeInAction(
                    type="ADD_FADE_IN", clip_id=a.clip_id, duration_ms=nd
                )

        # ── ADD_FADE_OUT — clamp start_ms and duration_ms ────────────────────
        elif t == "ADD_FADE_OUT":
            a = action  # type: AddFadeOutAction
            ns = _clamp(a.start_ms, 0.0, dur * 1000)
            nd = _clamp(a.duration_ms, 10.0, 10000.0)
            changed = ns != a.start_ms or nd != a.duration_ms
            if changed:
                clamped.append(
                    f"ADD_FADE_OUT start_ms {a.start_ms:.0f}→{ns:.0f} dur {a.duration_ms:.0f}→{nd:.0f}"
                )
                action = AddFadeOutAction(
                    type="ADD_FADE_OUT",
                    clip_id=a.clip_id,
                    start_ms=ns,
                    duration_ms=nd,
                )

        # ── ADD_RECT_MASK — clamp all coords to [0,1] ─────────────────────────
        elif t == "ADD_RECT_MASK":
            a = action  # type: AddRectMaskAction
            nx = _clamp(a.x, 0.0, 1.0)
            ny = _clamp(a.y, 0.0, 1.0)
            nw = _clamp(a.width, 0.0, 1.0)
            nh = _clamp(a.height, 0.0, 1.0)
            changed = nx != a.x or ny != a.y or nw != a.width or nh != a.height
            if changed:
                clamped.append(f"ADD_RECT_MASK coords clamped for clip {a.clip_id}")
                action = AddRectMaskAction(
                    type="ADD_RECT_MASK",
                    clip_id=a.clip_id,
                    x=nx,
                    y=ny,
                    width=nw,
                    height=nh,
                    feather=a.feather,
                    invert=a.invert,
                )

        # ── ADD_ELLIPSE_MASK — clamp centre and radii to [0,1] ───────────────
        elif t == "ADD_ELLIPSE_MASK":
            a = action  # type: AddEllipseMaskAction
            ncx = _clamp(a.cx, 0.0, 1.0)
            ncy = _clamp(a.cy, 0.0, 1.0)
            nrx = _clamp(a.rx, 0.001, 1.0)
            nry = _clamp(a.ry, 0.001, 1.0)
            changed = ncx != a.cx or ncy != a.cy or nrx != a.rx or nry != a.ry
            if changed:
                clamped.append(f"ADD_ELLIPSE_MASK coords clamped for clip {a.clip_id}")
                action = AddEllipseMaskAction(
                    type="ADD_ELLIPSE_MASK",
                    clip_id=a.clip_id,
                    cx=ncx,
                    cy=ncy,
                    rx=nrx,
                    ry=nry,
                    rotation=a.rotation,
                    feather=a.feather,
                    invert=a.invert,
                )

        # ── ADD_BEZIER_MASK — drop if fewer than 3 points ─────────────────────
        elif t == "ADD_BEZIER_MASK":
            a = action  # type: AddBezierMaskAction
            if len(a.points) < 3:
                dropped.append(
                    f"ADD_BEZIER_MASK dropped — only {len(a.points)} points (need ≥3)"
                )
                continue

        # ── ADD_AI_PERSON_MASK / CLEAR_MASKS — pass-through ──────────────────
        elif t in ("ADD_AI_PERSON_MASK", "CLEAR_MASKS"):
            pass

        # ── SET_KEYFRAME — clamp time_ms to [0, dur*1000] ────────────────────
        elif t == "SET_KEYFRAME":
            from models.ai_editor import SetKeyframeAction

            a = action  # type: SetKeyframeAction
            nt = _clamp(a.time_ms, 0.0, dur * 1000)
            if nt != a.time_ms:
                clamped.append(f"SET_KEYFRAME time_ms clamped to {nt:.0f}")
                action = SetKeyframeAction(
                    type="SET_KEYFRAME",
                    clip_id=a.clip_id,
                    property=a.property,
                    time_ms=nt,
                    value=a.value,
                    easing=a.easing,
                )

        # ── DELETE_KEYFRAME / CLEAR_KEYFRAMES — pass-through ─────────────────
        elif t in ("DELETE_KEYFRAME", "CLEAR_KEYFRAMES"):
            pass

        # ── SAVE_PROJECT / LOAD_PROJECT — pass-through ────────────────────────
        elif t in ("SAVE_PROJECT", "LOAD_PROJECT"):
            pass

        # ── AUTO_REFRAME — pass-through ───────────────────────────────────────
        elif t == "AUTO_REFRAME":
            pass

        # ── ADD_VOICEOVER — clamp start_sec + duration_sec ───────────────────
        elif t == "ADD_VOICEOVER":
            from models.ai_editor import AddVoiceoverAction

            a = action  # type: AddVoiceoverAction
            dur = state.videoDuration
            s = max(0.0, min(a.start_sec, dur))
            d = max(0.1, min(a.duration_sec, dur - s if dur > s else 300.0))
            if s != a.start_sec or d != a.duration_sec:
                action = AddVoiceoverAction(
                    type="ADD_VOICEOVER",
                    clip_id=a.clip_id,
                    start_sec=s,
                    duration_sec=d,
                )
                clamped.append("ADD_VOICEOVER start_sec/duration_sec clamped")

        # ── ADD_SFX — clamp volume ────────────────────────────────────────────
        elif t == "ADD_SFX":
            from models.ai_editor import AddSfxAction

            a = action  # type: AddSfxAction
            vol = max(0.0, min(2.0, a.volume))
            if vol != a.volume:
                action = AddSfxAction(
                    type="ADD_SFX",
                    sfx_id=a.sfx_id,
                    start_sec=max(0.0, a.start_sec),
                    volume=vol,
                )
                clamped.append("ADD_SFX volume clamped")

        # ── SET_TRANSITION — pass-through ─────────────────────────────────────
        elif t == "SET_TRANSITION":
            pass

        safe.append(action)

    return safe, clamped, dropped


# ─── Mock provider ────────────────────────────────────────────────────────────


def mock_response(
    state: AIEditorCurrentState,
) -> tuple[list[AiEditorAction], str, list[str]]:
    """Return 4 deterministic actions without calling Gemini."""
    actions: list[AiEditorAction] = [
        TrimAction(type="TRIM", start=0.0, end=max(state.videoDuration, 1.0)),
        AddCaptionAction(
            type="ADD_CAPTION",
            text="🔥 AI-generated hook",
            startTime=0.0,
            endTime=min(3.0, state.videoDuration),
        ),
        SetVisualFilterAction(type="SET_VISUAL_FILTER", filter="Cinematic"),
        AddElementAction(
            type="ADD_ELEMENT",
            element=TextElementData(
                type="TEXT",
                text="Subscribe for more! 🎯",
                x=540.0,
                y=1700.0,
                scale=1.2,
                color="#a855f7",
            ),
        ),
    ]

    sanitised, _, _ = sanitise(actions, state)
    suggestions = [
        "Add a zoom effect on the speaker",
        "Boost audio to 140%",
        "Split at the first scene break",
    ]
    return (
        sanitised,
        f"Mock: applied {len(sanitised)} demo edits (MOCK_AI_EDITOR=true).",
        suggestions,
    )


# ─── QEP patch validator (Pillar III) ─────────────────────────────────────────


def validate_patches(raw_patches: list[dict], project_clip_ids: set[str] | None = None):
    """Validate a list of raw dicts from an AI agent against the QepPatch allow-list.

    Args:
        raw_patches:       List of raw action dicts emitted by the AI agent.
        project_clip_ids:  Optional set of valid clip_id / track_id values from
                           the user's current Project.qep. When provided, any
                           patch referencing an unknown ID is rejected.

    Returns:
        A list of validated QepPatch model instances.

    Raises:
        HTTPException(422): On any validation failure (unknown type, field
                            out-of-range, or unknown clip/track reference).
    """
    from fastapi import HTTPException
    from pydantic import ValidationError

    try:
        from agent.action_models import QepPatch, VALID_ACTION_TYPES
        from pydantic import TypeAdapter
    except ImportError as exc:
        logger.error("validate_patches: action_models import failed: %s", exc)
        raise HTTPException(status_code=500, detail="Action catalogue unavailable")

    ta: TypeAdapter = TypeAdapter(QepPatch)
    validated = []

    for i, raw in enumerate(raw_patches):
        if not isinstance(raw, dict):
            _emit_patch_failure("unknown", "not_a_dict")
            raise HTTPException(
                status_code=422,
                detail=f"Patch #{i} is not a JSON object",
            )

        action_type = raw.get("type", "<missing>")

        # Fast allow-list check before Pydantic (cheaper)
        if action_type not in VALID_ACTION_TYPES:
            _emit_patch_failure(action_type, "unknown_type")
            raise HTTPException(
                status_code=422,
                detail=f"Patch #{i}: unknown action type '{action_type}'",
            )

        try:
            patch = ta.validate_python(raw)
        except ValidationError as exc:
            first_err = exc.errors()[0]
            field = ".".join(str(l) for l in first_err.get("loc", []))
            _emit_patch_failure(action_type, field)
            raise HTTPException(
                status_code=422,
                detail=f"Patch #{i} ({action_type}): validation error on field '{field}': {first_err.get('msg')}",
            )

        # Optional: reject patches referencing clip/track IDs not in the project
        if project_clip_ids is not None:
            ref_id = (
                getattr(patch, "clip_id", None)
                or getattr(patch, "track_id", None)
                or getattr(patch, "after_clip_id", None)
                or getattr(patch, "from_clip_id", None)
            )
            if ref_id and ref_id not in project_clip_ids:
                _emit_patch_failure(action_type, "unknown_clip_id")
                raise HTTPException(
                    status_code=422,
                    detail=f"Patch #{i} ({action_type}): '{ref_id}' does not exist in this project",
                )

        validated.append(patch)

    return validated


def _emit_patch_failure(action_type: str, field: str) -> None:
    """Log patch validation failure to Sentry and structured logs."""
    logger.warning(
        "ai_patch_validation_failure action_type=%s field=%s",
        action_type,
        field,
    )
    try:
        import sentry_sdk

        sentry_sdk.capture_message(
            f"AI patch rejected: type={action_type} field={field}",
            level="warning",
        )
    except Exception:
        pass
