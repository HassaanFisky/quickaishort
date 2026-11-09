"""Deterministic CPU Fast Engine test suite (0 Gemini, 0 external network).

Covers the complete zero-spend CPU fast path of QuickAI Studio:
1. SemanticEditPlanner — polarity, negation/constraint deferral, registry emit gate.
2. DecisionService — dead-air, director packaging, opening restore, risk & reversibility.
3. CapabilityRegistry & NativeTools — schema integrity and FunctionDeclaration wiring.
4. AIEditorSanitiser & DirectorLoop — ModePack aspect-ratio canvas bounds & clamping
   (runs full Pydantic v2 validation when pydantic>=2 is installed).

Runnable both directly (`PYTHONPATH=.:./fastapi python3 fastapi/tests/test_cpu_fast_engine.py`)
and via pytest (`pytest fastapi/tests/test_cpu_fast_engine.py`).
"""

from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timezone

# Ensure fastapi/ is importable regardless of working directory
_FASTAPI_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _FASTAPI_DIR not in sys.path:
    sys.path.insert(0, _FASTAPI_DIR)

import pydantic  # noqa: E402
from models.media_graph import FacetBlob, MediaGraph  # noqa: E402
from models.studio_project import StudioProjectHead  # noqa: E402
from services.decision_service import (  # noqa: E402
    REMOVE_SILENCES_CAPABILITY,
    classify_objective,
    decide_from_state,
)
from services.native_tools import build_editor_function_declarations  # noqa: E402
from services.semantic_edit_planner import SemanticEditPlanner  # noqa: E402
from services.tool_registry import (  # noqa: E402
    get_capability,
    is_emit_allowed,
    load_registry,
    resolve_alias,
)

_PYDANTIC_V2 = int(str(getattr(pydantic, "__version__", "1")).split(".")[0]) >= 2


def _make_graph(*, silence_segments: list[dict] | None = None) -> MediaGraph:
    now = datetime.now(timezone.utc)
    facets: dict[str, FacetBlob] = {
        "duration": FacetBlob(status="ready", data={"seconds": 60.0}),
    }
    if silence_segments is not None:
        facets["silence"] = FacetBlob(
            status="ready",
            data={"segments": silence_segments},
        )
    return MediaGraph(
        graph_id="g-cpu-fast",
        owner_user_id="u-cpu-fast",
        project_id="p-cpu-fast",
        created_at=now,
        updated_at=now,
        status="ready",
        facets=facets,
        revision=1,
    )


def _make_head() -> StudioProjectHead:
    now = datetime.now(timezone.utc)
    return StudioProjectHead(
        project_id="p-cpu-fast",
        owner_user_id="u-cpu-fast",
        title="CPU Fast Engine Test",
        created_at=now,
        updated_at=now,
        revision=1,
        media_graph_id="g-cpu-fast",
    )


def test_semantic_planner_polarity_and_deferral() -> None:
    # Brightness polarity
    up = SemanticEditPlanner.plan("make it brighter")
    assert up is not None and up.intent == "brighten_clip"
    assert up.actions == [{"type": "ADD_FILTER", "filter": "brightness", "value": 1.2}]

    down = SemanticEditPlanner.plan("reduce the brightness")
    assert down is not None and down.intent == "darken_clip"
    assert down.actions == [
        {"type": "ADD_FILTER", "filter": "brightness", "value": 0.85}
    ]

    # Speed polarity
    faster = SemanticEditPlanner.plan("speed it up to 1.5x")
    assert faster is not None and faster.actions == [
        {"type": "SET_PLAYBACK_SPEED", "value": 150}
    ]

    slower = SemanticEditPlanner.plan("slow down the playback speed")
    assert slower is not None and slower.actions == [
        {"type": "SET_PLAYBACK_SPEED", "value": 75}
    ]

    # Captions polarity
    caps_on = SemanticEditPlanner.plan("add captions")
    assert caps_on is not None and caps_on.actions == [
        {"type": "TOGGLE_CAPTIONS", "enabled": True}
    ]
    caps_off = SemanticEditPlanner.plan("hide the subtitles")
    assert caps_off is not None and caps_off.actions == [
        {"type": "TOGGLE_CAPTIONS", "enabled": False}
    ]

    # Negation & trade-off deferral
    assert SemanticEditPlanner.plan("don't make it brighter") is None
    assert (
        SemanticEditPlanner.plan("make it brighter but keep skin tones natural") is None
    )


def test_decision_intelligence_risk_and_reversibility() -> None:
    assert classify_objective("Remove dead air and tighten pacing") == "dead_air_pacing"
    assert classify_objective("Keep the original opening") == "revise_opening"
    assert (
        classify_objective("Make a 45s YouTube Short and cut dead air")
        == "director_packaging"
    )

    graph = _make_graph(
        silence_segments=[
            {"start": 2.0, "end": 4.0, "type": "silence"},
            {"start": 10.0, "end": 12.0, "type": "silence"},
        ]
    )
    rec = decide_from_state(
        "Remove unnecessary dead air and tighten the pacing",
        project_id="p-cpu-fast",
        graph=graph,
        head=_make_head(),
    )
    assert rec.mode == "ACT"
    assert rec.gemini_called is False
    assert rec.credits_charged == 0
    assert rec.risk == "medium"
    assert rec.reversibility == "reversible"
    assert len(rec.candidate_actions) == 1
    assert rec.candidate_actions[0].capability_id == REMOVE_SILENCES_CAPABILITY

    # ASK mode when silence evidence is missing -> risk=none, reversibility=not_applicable
    ask_rec = decide_from_state(
        "Remove dead air",
        project_id="p-cpu-fast",
        graph=_make_graph(silence_segments=None),
        head=_make_head(),
    )
    assert ask_rec.mode == "ASK"
    assert ask_rec.risk == "none"
    assert ask_rec.reversibility == "not_applicable"

    # Revise opening restores prior TRIM start to 0
    rev_rec = decide_from_state(
        "Keep the original opening",
        project_id="p-cpu-fast",
        graph=graph,
        head=_make_head(),
        project_context={"markIn": 5.0, "markOut": 45.0, "videoDuration": 60.0},
    )
    assert rev_rec.mode == "ACT"
    assert rev_rec.risk == "medium"
    assert rev_rec.reversibility == "reversible"
    assert rev_rec.candidate_actions[0].capability_id == "TRIM"
    assert rev_rec.candidate_actions[0].params["start"] == 0.0


def test_registry_and_native_tools_wiring() -> None:
    doc = load_registry()
    assert doc["version"] == 1
    assert len(doc["capabilities"]) >= 75
    assert resolve_alias("razor_tool") == "BLADE_SPLIT"
    assert resolve_alias("ripple_delete") == "RIPPLE_DELETE"

    decls = build_editor_function_declarations("trim video and add captions")
    assert len(decls) > 0
    for d in decls:
        assert "name" in d
        assert get_capability(d["name"]) is not None
        assert is_emit_allowed(d["name"])
        assert isinstance(d.get("parameters"), dict)
        assert d["parameters"].get("type") == "object"


def test_sanitiser_and_director_loop_when_pydantic_v2() -> None:
    if not _PYDANTIC_V2:
        return

    from models.ai_editor import (
        AIEditorCurrentState,
        AddCaptionAction,
        AddElementAction,
        AddFilterAction,
        TextElementData,
        TrimAction,
        UpdateElementAction,
    )
    from services.ai_editor_sanitiser import _canvas_bounds_for_aspect, sanitise
    from services.director_loop import (
        _state_from_context,
        try_deterministic_director_command,
    )

    assert _canvas_bounds_for_aspect("9:16") == (1080.0, 1920.0)
    assert _canvas_bounds_for_aspect("16:9") == (1920.0, 1080.0)
    assert _canvas_bounds_for_aspect("1:1") == (1080.0, 1080.0)
    assert _canvas_bounds_for_aspect("4:5") == (1080.0, 1350.0)

    # Unknown duration fails closed to 0.0
    st = _state_from_context({"duration": "invalid"})
    assert st.videoDuration == 0.0
    st_empty = _state_from_context({})
    assert st_empty.videoDuration == 0.0

    # Unrelated command returns None (defers to DualModelRouter)
    res = asyncio.run(
        try_deterministic_director_command(
            user_id="u1",
            command="apply a moody color grade",
            project_context={"videoDuration": 30.0},
        )
    )
    assert res is None

    # 16:9 landscape allows x up to 1920, clamps y to 1080
    landscape_state = AIEditorCurrentState(
        videoDuration=45.0,
        aspectRatio="16:9",
    )
    el_action = AddElementAction(
        type="ADD_ELEMENT",
        element=TextElementData(
            type="TEXT",
            text="Landscape Title",
            x=1600.0,
            y=1500.0,
        ),
    )
    safe, clamped, dropped = sanitise([el_action], landscape_state)
    assert len(safe) == 1
    assert not dropped
    assert len(clamped) == 1
    dumped = safe[0].model_dump()
    assert dumped["element"]["x"] == 1600.0
    assert dumped["element"]["y"] == 1080.0

    upd_action = UpdateElementAction(
        type="UPDATE_ELEMENT",
        id="el-1",
        patch={"x": 1800.0, "y": 1200.0},
    )
    safe_u, clamped_u, _ = sanitise([upd_action], landscape_state)
    assert len(safe_u) == 1
    assert safe_u[0].patch["x"] == 1800.0  # type: ignore[attr-defined]
    assert safe_u[0].patch["y"] == 1080.0  # type: ignore[attr-defined]
    assert len(clamped_u) == 1

    trim = TrimAction(type="TRIM", start=-5.0, end=120.0)
    caption = AddCaptionAction(
        type="ADD_CAPTION", text="Hook", startTime=0.0, endTime=5.0
    )
    filt = AddFilterAction(type="ADD_FILTER", filter="brightness", value=5.0)
    safe_t, clamped_t, _ = sanitise([trim, caption, filt], landscape_state)
    assert len(safe_t) == 3
    assert safe_t[0].start == 0.0  # type: ignore[attr-defined]
    assert safe_t[0].end == 45.0  # type: ignore[attr-defined]
    assert safe_t[2].value == 2.0  # type: ignore[attr-defined]
    assert len(clamped_t) == 2


def _run_all() -> None:
    suites = [
        (
            "SemanticEditPlanner polarity & deferral",
            test_semantic_planner_polarity_and_deferral,
        ),
        (
            "DecisionIntelligence risk, reversibility & opening restore",
            test_decision_intelligence_risk_and_reversibility,
        ),
        (
            "CapabilityRegistry & NativeTools wiring",
            test_registry_and_native_tools_wiring,
        ),
        (
            "Sanitiser ModePack aspect-ratio & DirectorLoop",
            test_sanitiser_and_director_loop_when_pydantic_v2,
        ),
    ]
    for label, fn in suites:
        fn()
        print(f"PASS: {label}")
    print(
        f"\nAll {len(suites)} CPU Fast Engine test suites passed (0 Gemini, 0 network)."
    )


if __name__ == "__main__":
    _run_all()
