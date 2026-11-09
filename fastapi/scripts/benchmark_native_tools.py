#!/usr/bin/env python3
"""ADR-006 Native FunctionDeclaration Benchmarking & Cutover Suite.

Benchmarks Gemini 2.5 Flash native FunctionDeclaration tool schemas against the
Capability Registry and validates that synthetic & reconstructed tool actions
pass sanitisation with >= 99.5% validity across 9:16, 16:9, 1:1, and 4:5 aspect ratios.

Zero-spend: deterministic schema validation and sanitiser pass-rate measurement.
Does not make outbound network or Gemini billing calls.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path

# Ensure root & fastapi/ on sys.path
FASTAPI_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = FASTAPI_DIR.parent
for p in (str(REPO_ROOT), str(FASTAPI_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

os.environ["STUDIO_NATIVE_TOOLS"] = "1"

from pydantic import TypeAdapter  # noqa: E402
from models.ai_editor import AIEditorCurrentState, AiEditorAction  # noqa: E402
from services.ai_editor_sanitiser import sanitise  # noqa: E402
from services.native_tools import (  # noqa: E402
    build_editor_function_declarations,
    function_calls_to_actions,
    native_tools_enabled,
)

_VALID_NAME = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


def benchmark_native_tool_schemas() -> dict[str, any]:
    assert native_tools_enabled(), "STUDIO_NATIVE_TOOLS must be enabled"

    test_commands = [
        "trim the first 5 seconds and add a hook caption",
        "speed up playback by 1.25x and boost audio",
        "switch to widescreen 16:9 and add lower third text",
        "cut all dead air silences and burn subtitles",
        "split at scene cuts and add impact sound effect",
        "zoom in on face and set volume to 150",
    ]

    total_decls = 0
    t0 = time.perf_counter()

    for cmd in test_commands:
        decls = build_editor_function_declarations(cmd)
        assert len(decls) > 0, f"Expected non-empty declarations for '{cmd}'"
        total_decls += len(decls)
        for d in decls:
            assert "name" in d, "Declaration missing name"
            assert _VALID_NAME.match(d["name"]), f"Invalid function declaration name: {d['name']}"
            assert "parameters" in d, "Declaration missing parameters"
            assert d["parameters"].get("type") == "object", f"Parameters must be object: {d['name']}"

    elapsed_ms = (time.perf_counter() - t0) * 1000

    # Synthetic tool calls for common editing operations
    synthetic_calls = [
        {"name": "TRIM", "args": {"start": 2.0, "end": 14.5}},
        {"name": "ADD_CAPTION", "args": {"text": "Viral Hook Line", "startTime": 0.5, "endTime": 4.0}},
        {"name": "SET_PLAYBACK_SPEED", "args": {"value": 125}},
        {"name": "SET_AUDIO_BOOST", "args": {"value": 110}},
        {"name": "SET_NOISE_REDUCTION", "args": {"value": 40}},
        {"name": "REMOVE_SILENCES", "args": {"min_silence_sec": 0.8, "padding_sec": 0.1}},
        {"name": "ADD_ELEMENT", "args": {"element": {"type": "TEXT", "text": "Subscribe", "x": 540, "y": 960, "scale": 1.0}}},
        {"name": "UPDATE_ELEMENT", "args": {"id": "el-1", "patch": {"x": 200, "y": 300}}},
        {"name": "REMOVE_ELEMENT", "args": {"id": "el-1"}},
        {"name": "SEEK", "args": {"time": 10.0}},
        {"name": "POINTER_SELECT", "args": {"clip_id": "clip-1"}},
        {"name": "BLADE_SPLIT", "args": {"time_sec": 5.0}},
        {"name": "SET_VISUAL_FILTER", "args": {"filter": "Cinematic"}},
        {"name": "TOGGLE_CAPTIONS", "args": {"enabled": True}},
        {"name": "ADD_SFX", "args": {"sfx_id": "impact-thud", "start_sec": 1.0, "volume": 0.8}},
    ]

    action_dicts = function_calls_to_actions(synthetic_calls)
    assert len(action_dicts) == len(synthetic_calls), "Actions length mismatch"

    ta = TypeAdapter(AiEditorAction)
    parsed_actions = [ta.validate_python(a) for a in action_dicts]

    ratios = ["9:16", "16:9", "1:1", "4:5"]
    valid_count = 0
    total_evals = 0

    for ratio in ratios:
        state = AIEditorCurrentState(
            videoDuration=60.0,
            currentTime=0.0,
            elementCount=1,
            captionCount=0,
            captionsEnabled=False,
            aspectRatio=ratio,
            visualFilter="None",
            audioBoost=100,
            playbackSpeed=100,
        )
        clean_actions, clamped, dropped = sanitise(
            actions=parsed_actions,
            state=state,
            enforce_emit_policy=False,
        )
        total_evals += len(parsed_actions)
        valid_count += len(clean_actions)

    validity_rate = (valid_count / total_evals) * 100.0

    report = {
        "studio_native_tools_flag": True,
        "test_commands_count": len(test_commands),
        "total_declarations_built": total_decls,
        "schema_build_time_ms": round(elapsed_ms, 2),
        "synthetic_calls_tested": len(synthetic_calls),
        "aspect_ratios_evaluated": ratios,
        "total_evaluations": total_evals,
        "valid_actions_passed": valid_count,
        "action_validity_rate": round(validity_rate, 2),
        "target_met": validity_rate >= 99.5,
    }

    return report


if __name__ == "__main__":
    report = benchmark_native_tool_schemas()
    print("=" * 60)
    print("ADR-006 Native Function Calling Benchmark Report")
    print("=" * 60)
    print(json.dumps(report, indent=2))
    print("=" * 60)
    if not report["target_met"]:
        print(f"FAILED: Action validity rate {report['action_validity_rate']}% < 99.5%")
        sys.exit(1)
    print("SUCCESS: Native tool calling benchmark >= 99.5% validity target met.")
    sys.exit(0)
