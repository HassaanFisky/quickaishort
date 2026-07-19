"""One-shot helper: emit bootstrap registry ids from ai_editor.py Action classes."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEXT = (ROOT / "models" / "ai_editor.py").read_text(encoding="utf-8")

EMIT_TRUE = {
    "ADD_CAPTION",
    "REMOVE_CAPTION",
    "UPDATE_CAPTION",
    "TRIM",
    "SPLIT_CLIP",
    "DELETE_CLIP",
    "SELECT_CLIP",
    "ADD_FILTER",
    "RESET_FILTER",
    "SET_VISUAL_FILTER",
    "SET_AUDIO_BOOST",
    "SET_NOISE_REDUCTION",
    "SET_PLAYBACK_SPEED",
    "TOGGLE_CAPTIONS",
    "TOGGLE_TRANSITIONS",
    "TOGGLE_VOICEOVER",
    "SEEK",
    "PLAY",
    "PAUSE",
    "EXPORT_CLIP",
    "ADD_ELEMENT",
    "UPDATE_ELEMENT",
    "REMOVE_ELEMENT",
    "REMOVE_SILENCES",
    "BLADE_SPLIT",
    "RIPPLE_DELETE",
    "MARK_IN",
    "MARK_OUT",
    "RANGE_MARK",
    "DETECT_VIRAL_MOMENTS",
    "GENERATE_HOOK_CAPTION",
    "SUGGEST_STYLE_PRESET",
    "ADD_BROLL",
    "ADD_VIDEO_OVERLAY",
    "REMOVE_OVERLAY",
}

TAG_HINTS = {
    "CAPTION": ["captions"],
    "TRIM": ["timeline", "clip"],
    "SPLIT": ["timeline", "clip"],
    "CLIP": ["timeline", "clip"],
    "FILTER": ["visual"],
    "AUDIO": ["audio"],
    "NOISE": ["audio"],
    "PLAY": ["playback"],
    "PAUSE": ["playback"],
    "SEEK": ["playback"],
    "EXPORT": ["export", "bake"],
    "ELEMENT": ["elements"],
    "BROLL": ["broll", "overlay"],
    "OVERLAY": ["overlay"],
    "SILENCE": ["audio", "timeline"],
    "MASK": ["mask", "visual"],
    "KEYFRAME": ["motion"],
    "COLOR": ["color"],
    "LUT": ["color"],
    "MARK": ["timeline"],
    "RIPPLE": ["timeline"],
    "ROLLING": ["timeline"],
    "SLIP": ["timeline"],
    "SLIDE": ["timeline"],
    "ZOOM": ["timeline", "ui_only"],
    "HAND": ["ui_only"],
    "VOICE": ["audio"],
    "SFX": ["audio"],
    "TRANSITION": ["visual"],
    "REFRAME": ["visual"],
    "PROJECT": ["project"],
    "VIRAL": ["ai"],
    "HOOK": ["ai", "captions"],
    "STYLE": ["ai", "visual"],
    "EXPLAIN": ["ai", "ui_only"],
}


def tags_for(cid: str) -> list[str]:
    tags: set[str] = set()
    for needle, vals in TAG_HINTS.items():
        if needle in cid:
            tags.update(vals)
    if not tags:
        tags.add("general")
    return sorted(tags)


def main() -> None:
    parts = re.split(r"\nclass ", TEXT)
    ordered: list[str] = []
    seen: set[str] = set()
    for part in parts[1:]:
        header = part.split("\n", 1)[0]
        if "Action" not in header or "BaseModel" not in header:
            continue
        # skip non-editor element helpers without Action suffix properly
        class_name = header.split("(", 1)[0].strip()
        if not class_name.endswith("Action"):
            continue
        match = re.search(r'type:\s*Literal\["([A-Z][A-Z0-9_]+)"\]', part)
        if not match:
            continue
        cid = match.group(1)
        if cid in seen:
            continue
        seen.add(cid)
        ordered.append(cid)

    capabilities = []
    for cid in ordered:
        emit = cid in EMIT_TRUE
        capabilities.append(
            {
                "id": cid,
                "version": 1,
                "title": cid.replace("_", " ").title(),
                "description": f"Studio capability {cid}.",
                "tags": tags_for(cid),
                "side_effects": (
                    ["preview", "mutate_project"]
                    if emit
                    else ["preview"]
                ),
                "exec_locus": "client",
                "cost_class": (
                    "llm"
                    if cid.startswith(("DETECT_", "GENERATE_", "SUGGEST_", "EXPLAIN_"))
                    else "bake"
                    if cid == "EXPORT_CLIP"
                    else "free"
                ),
                "latency_class": (
                    "fast"
                    if cid.startswith(("DETECT_", "GENERATE_", "SUGGEST_"))
                    else "async_job"
                    if cid == "EXPORT_CLIP"
                    else "instant"
                ),
                "idempotent": cid in {"PLAY", "PAUSE", "SEEK", "SELECT_CLIP"},
                "parallel_safe": False,
                "requires_facets": [],
                "orchestrator_emit": emit,
                "runtime_status": "wired" if emit else "partial",
                "compensating_hint": "undo_event",
                "aliases": [],
                "param_schema": {"type": "object"},
            }
        )

    out_dir = ROOT / "capabilities"
    out_dir.mkdir(parents=True, exist_ok=True)
    doc = {"version": 1, "capabilities": capabilities}
    (out_dir / "registry.v1.json").write_text(
        json.dumps(doc, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Wrote {len(capabilities)} capabilities to {out_dir / 'registry.v1.json'}")


if __name__ == "__main__":
    main()
