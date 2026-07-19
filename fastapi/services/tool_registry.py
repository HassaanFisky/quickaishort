"""Capability Registry ABI — QuickAI Studio OS tool contract.

Source of truth: fastapi/capabilities/registry.v1.json
Deprecated ToolName dialect: fastapi/capabilities/aliases.v1.json

Public API used by sanitiser, ai_editor_engine, and /api/capabilities.
"""

from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

_CAPABILITIES_DIR = Path(__file__).resolve().parent.parent / "capabilities"
_REGISTRY_PATH = _CAPABILITIES_DIR / "registry.v1.json"
_ALIASES_PATH = _CAPABILITIES_DIR / "aliases.v1.json"
_SCHEMA_PATH = _CAPABILITIES_DIR / "schema.v1.json"

_REQUIRED_CAP_FIELDS = (
    "id",
    "version",
    "title",
    "description",
    "tags",
    "side_effects",
    "exec_locus",
    "cost_class",
    "latency_class",
    "idempotent",
    "parallel_safe",
    "requires_facets",
    "orchestrator_emit",
    "runtime_status",
    "param_schema",
)

_EXEC_LOCUS = frozenset({"client", "server", "worker"})
_COST_CLASS = frozenset({"free", "llm", "bake", "network"})
_LATENCY = frozenset({"instant", "fast", "slow", "async_job"})
_RUNTIME = frozenset({"wired", "partial", "schema_only"})
_SIDE_EFFECTS = frozenset(
    {"preview", "mutate_project", "network", "bake", "billing", "ui_only"}
)
_ID_RE = re.compile(r"^[A-Z][A-Z0-9_]+$")

# Cheap keyword → tag retrieval (planner only — NOT user-facing suggestions)
_TAG_KEYWORDS: list[tuple[re.Pattern[str], list[str]]] = [
    (re.compile(r"caption|subtitle|text|title|hook", re.I), ["captions", "ai"]),
    (re.compile(r"trim|cut|split|blade|razor|silence|pause|filler", re.I), ["timeline", "clip", "audio"]),
    (re.compile(r"audio|volume|boost|noise|duck|fade|sfx|voice", re.I), ["audio"]),
    (re.compile(r"filter|cinematic|urban|retro|color|lut|grade", re.I), ["visual", "color"]),
    (re.compile(r"export|render|download", re.I), ["export", "bake"]),
    (re.compile(r"b-?roll|overlay|sticker|element", re.I), ["broll", "overlay", "elements"]),
    (re.compile(r"zoom|pan|scroll|timeline", re.I), ["timeline", "ui_only"]),
    (re.compile(r"mask|keyframe|motion", re.I), ["mask", "motion"]),
    (re.compile(r"viral|moment|style|suggest", re.I), ["ai"]),
    (re.compile(r"play|pause|seek|scrub", re.I), ["playback"]),
]


class RegistryError(RuntimeError):
    """Raised when the capability registry fails validation."""


def _read_json(path: Path) -> Any:
    if not path.is_file():
        raise RegistryError(f"Missing capability file: {path}")
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def _validate_capability(cap: dict[str, Any], index: int) -> None:
    for field in _REQUIRED_CAP_FIELDS:
        if field not in cap:
            raise RegistryError(f"capabilities[{index}] missing field '{field}'")
    cid = cap["id"]
    if not isinstance(cid, str) or not _ID_RE.match(cid):
        raise RegistryError(f"capabilities[{index}] invalid id: {cid!r}")
    if cap["exec_locus"] not in _EXEC_LOCUS:
        raise RegistryError(f"{cid}: invalid exec_locus")
    if cap["cost_class"] not in _COST_CLASS:
        raise RegistryError(f"{cid}: invalid cost_class")
    if cap["latency_class"] not in _LATENCY:
        raise RegistryError(f"{cid}: invalid latency_class")
    if cap["runtime_status"] not in _RUNTIME:
        raise RegistryError(f"{cid}: invalid runtime_status")
    if not isinstance(cap["orchestrator_emit"], bool):
        raise RegistryError(f"{cid}: orchestrator_emit must be bool")
    for se in cap["side_effects"]:
        if se not in _SIDE_EFFECTS:
            raise RegistryError(f"{cid}: invalid side_effect {se!r}")


def _action_discriminator_ids() -> set[str]:
    """Extract AiEditorAction type literals from models.ai_editor without importing union at module import cost repeatedly."""
    from models import ai_editor as mod

    text = Path(mod.__file__).read_text(encoding="utf-8")
    parts = re.split(r"\nclass ", text)
    ids: set[str] = set()
    for part in parts[1:]:
        header = part.split("\n", 1)[0]
        if "Action" not in header or "BaseModel" not in header:
            continue
        class_name = header.split("(", 1)[0].strip()
        if not class_name.endswith("Action"):
            continue
        match = re.search(r'type:\s*Literal\["([A-Z][A-Z0-9_]+)"\]', part)
        if match:
            ids.add(match.group(1))
    return ids


@lru_cache(maxsize=1)
def load_registry() -> dict[str, Any]:
    """Load and structurally validate registry.v1.json. Cached process-wide."""
    doc = _read_json(_REGISTRY_PATH)
    if doc.get("version") != 1:
        raise RegistryError(f"Unsupported registry version: {doc.get('version')}")
    caps = doc.get("capabilities")
    if not isinstance(caps, list) or not caps:
        raise RegistryError("registry.capabilities must be a non-empty array")

    seen: set[str] = set()
    for i, cap in enumerate(caps):
        if not isinstance(cap, dict):
            raise RegistryError(f"capabilities[{i}] must be an object")
        _validate_capability(cap, i)
        cid = cap["id"]
        if cid in seen:
            raise RegistryError(f"Duplicate capability id: {cid}")
        seen.add(cid)

    # Schema file presence check (full JSON Schema engine optional)
    if not _SCHEMA_PATH.is_file():
        logger.warning("capability schema missing at %s", _SCHEMA_PATH)

    logger.info(
        "capability_registry_loaded path=%s count=%d emit_allowed=%d",
        _REGISTRY_PATH,
        len(caps),
        sum(1 for c in caps if c.get("orchestrator_emit")),
    )
    return doc


@lru_cache(maxsize=1)
def load_aliases() -> dict[str, Any]:
    doc = _read_json(_ALIASES_PATH)
    if doc.get("version") != 1:
        raise RegistryError(f"Unsupported aliases version: {doc.get('version')}")
    if "map" not in doc or not isinstance(doc["map"], dict):
        raise RegistryError("aliases.map must be an object")
    return doc


def _by_id() -> dict[str, dict[str, Any]]:
    return {c["id"]: c for c in load_registry()["capabilities"]}


def get_capability(capability_id: str) -> Optional[dict[str, Any]]:
    return _by_id().get(capability_id)


def list_emit_allowed() -> list[dict[str, Any]]:
    return [c for c in load_registry()["capabilities"] if c.get("orchestrator_emit")]


def is_emit_allowed(capability_id: str) -> bool:
    cap = get_capability(capability_id)
    return bool(cap and cap.get("orchestrator_emit"))


def resolve_alias(tool_name: str) -> Optional[str]:
    """Map deprecated ToolName string → capability_id. None means unmapped/null alias."""
    mapping = load_aliases()["map"]
    if tool_name not in mapping:
        logger.warning("unknown_capability_alias tool_name=%s", tool_name)
        return None
    target = mapping[tool_name]
    if target is None:
        return None
    if get_capability(target) is None:
        logger.warning(
            "alias_target_missing tool_name=%s capability_id=%s", tool_name, target
        )
        return None
    return str(target)


def intent_tags_from_command(command: str) -> list[str]:
    tags: set[str] = set()
    for pattern, tag_list in _TAG_KEYWORDS:
        if pattern.search(command or ""):
            tags.update(tag_list)
    return sorted(tags)


def retrieve_for_intent(tags: list[str], limit: int = 24) -> list[dict[str, Any]]:
    """Tag-overlap retrieval among emit-allowed capabilities; fallback = emit-allowed capped."""
    emit = list_emit_allowed()
    if not tags:
        return emit[:limit]
    tag_set = set(tags)
    scored: list[tuple[int, dict[str, Any]]] = []
    for cap in emit:
        overlap = len(tag_set.intersection(cap.get("tags") or []))
        if overlap:
            scored.append((overlap, cap))
    scored.sort(key=lambda x: (-x[0], x[1]["id"]))
    if not scored:
        return emit[:limit]
    return [c for _, c in scored[:limit]]


def build_planner_prompt_section(capabilities: list[dict[str, Any]]) -> str:
    """Deterministic tool catalogue for Gemini — registry only."""
    lines = [
        "AVAILABLE CAPABILITIES (canonical AiEditorAction.type ids — emit only these):",
        "Return actions as objects with a top-level \"type\" field matching an id below.",
        "",
    ]
    for cap in capabilities:
        lines.append(
            f"- {cap['id']}: {cap['title']} — {cap['description']} "
            f"[tags={','.join(cap.get('tags') or [])}; locus={cap['exec_locus']}; cost={cap['cost_class']}]"
        )
    return "\n".join(lines)


def build_orchestrator_system_prompt(command: str) -> str:
    tags = intent_tags_from_command(command)
    caps = retrieve_for_intent(tags, limit=24)
    catalogue = build_planner_prompt_section(caps)
    return f"""You are the AI editing kernel of QuickAI Studio — an AI-native video editing operating system.

ROLE: Convert the director's natural-language command into a JSON plan of real editing capabilities.
You are not a chatbot. You do not invent tools. You only emit capability ids listed below.

{catalogue}

RULES:
1. Understand intent, then emit the minimal ordered action list.
2. Respond ONLY with valid JSON — no markdown fences, no prose outside JSON.
3. Prefer this exact shape:
{{
  "intent": "brief description",
  "confidence": 0.0,
  "actions": [
    {{ "type": "TRIM", "start": 0.0, "end": 10.0 }}
  ],
  "message": "Past-tense confirmation, max 14 words",
  "suggestions": ["follow-up 1", "follow-up 2", "follow-up 3"],
  "feedback": "One line telling the user what will happen",
  "fallback": "What to do if this fails",
  "status": "ok"
}}
4. Legacy shape is also accepted for one release: actions as {{"tool":"<deprecated_tool_name>","params":{{...}},"order":1}}. Prefer canonical "type".
5. Never emit a capability id that is not listed above.
6. If the request is ambiguous, return status "clarification_needed" with empty actions.
7. If nothing should change, return status "no_op" with empty actions.
"""


def normalize_command_actions(
    actions: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[str]]:
    """Convert legacy {{tool, params, order}} or canonical {{type, ...}} → canonical action dicts.

    Returns (normalized_actions, drop_reasons).
    """
    normalized: list[dict[str, Any]] = []
    dropped: list[str] = []

    for raw in actions or []:
        if not isinstance(raw, dict):
            dropped.append("alias_param_unmapped:non_object")
            continue

        # Canonical path
        if "type" in raw and "tool" not in raw:
            cid = raw["type"]
            if not isinstance(cid, str):
                dropped.append("unknown_capability:non_string_type")
                continue
            if get_capability(cid) is None:
                logger.warning("unknown_capability_id id=%s", cid)
                dropped.append(f"unknown_capability:{cid}")
                continue
            normalized.append(dict(raw))
            continue

        # Deprecated ToolName dialect
        tool = raw.get("tool")
        if not tool or not isinstance(tool, str):
            dropped.append("alias_param_unmapped:missing_tool")
            continue

        cid = resolve_alias(tool)
        if cid is None:
            dropped.append(f"alias_unmapped_or_null:{tool}")
            continue

        params = raw.get("params") or {}
        if not isinstance(params, dict):
            params = {}

        try:
            action = _map_legacy_params(cid, params, tool)
        except _UnmappedParams as exc:
            dropped.append(f"alias_param_unmapped:{tool}->{cid}:{exc}")
            continue

        normalized.append(action)

    return normalized, dropped


class _UnmappedParams(ValueError):
    pass


def _map_legacy_params(
    capability_id: str, params: dict[str, Any], tool: str
) -> dict[str, Any]:
    """Map ToolParams bag onto a canonical action dict. Fail closed on ambiguity."""
    clip_id = params.get("clip_id")
    start_time = params.get("start_time")
    end_time = params.get("end_time")
    value = params.get("value")
    text_content = params.get("text_content")
    speed_factor = params.get("speed_factor")

    if capability_id == "POINTER_SELECT":
        out: dict[str, Any] = {"type": "POINTER_SELECT"}
        if clip_id:
            out["clip_id"] = clip_id
        return out

    if capability_id == "FORWARD_LANE_SELECT":
        out = {"type": "FORWARD_LANE_SELECT"}
        if clip_id:
            out["clip_id"] = clip_id
        return out

    if capability_id == "BACKWARD_LANE_SELECT":
        out = {"type": "BACKWARD_LANE_SELECT"}
        if clip_id:
            out["clip_id"] = clip_id
        return out

    if capability_id == "RIPPLE_DELETE":
        if not clip_id:
            raise _UnmappedParams("clip_id required")
        return {"type": "RIPPLE_DELETE", "clip_id": clip_id}

    if capability_id == "ROLLING_TRIM":
        if not clip_id:
            raise _UnmappedParams("clip_id required")
        delta = 0.0
        if isinstance(end_time, (int, float)) and isinstance(start_time, (int, float)):
            delta = float(end_time) - float(start_time)
        elif isinstance(value, (int, float)):
            delta = float(value)
        return {
            "type": "ROLLING_TRIM",
            "clip_id": clip_id,
            "neighbor_id": params.get("neighbor_id") or clip_id,
            "edge": "out",
            "delta_sec": delta,
        }

    if capability_id == "DURATION_STRETCH":
        if not clip_id:
            raise _UnmappedParams("clip_id required")
        sf = speed_factor if speed_factor is not None else value
        out = {"type": "DURATION_STRETCH", "clip_id": clip_id}
        if isinstance(sf, (int, float)):
            out["speed_factor"] = float(sf)
        return out

    if capability_id == "BLADE_SPLIT":
        t = start_time if start_time is not None else value
        if not isinstance(t, (int, float)):
            raise _UnmappedParams("start_time/value required for blade")
        return {"type": "BLADE_SPLIT", "time_sec": float(t)}

    if capability_id == "SLIP_CLIP":
        if not clip_id:
            raise _UnmappedParams("clip_id required")
        delta = float(value) if isinstance(value, (int, float)) else 0.0
        return {"type": "SLIP_CLIP", "clip_id": clip_id, "delta_sec": delta}

    if capability_id == "SLIDE_CLIP":
        if not clip_id:
            raise _UnmappedParams("clip_id required")
        delta = float(value) if isinstance(value, (int, float)) else 0.0
        return {"type": "SLIDE_CLIP", "clip_id": clip_id, "delta_sec": delta}

    if capability_id == "SET_KEYFRAME":
        if not clip_id:
            raise _UnmappedParams("clip_id required")
        time_ms = int(float(start_time) * 1000) if isinstance(start_time, (int, float)) else 0
        return {
            "type": "SET_KEYFRAME",
            "clip_id": clip_id,
            "property": str(value) if value is not None else "opacity",
            "time_ms": time_ms,
            "value": float(value) if isinstance(value, (int, float)) else 0.0,
        }

    if capability_id == "ADD_RECT_MASK":
        if not clip_id:
            raise _UnmappedParams("clip_id required")
        return {
            "type": "ADD_RECT_MASK",
            "clip_id": clip_id,
            "x": 0.1,
            "y": 0.1,
            "width": 0.8,
            "height": 0.8,
        }

    if capability_id == "ADD_ELLIPSE_MASK":
        if not clip_id:
            raise _UnmappedParams("clip_id required")
        return {
            "type": "ADD_ELLIPSE_MASK",
            "clip_id": clip_id,
            "cx": 0.5,
            "cy": 0.5,
            "rx": 0.4,
            "ry": 0.4,
        }

    if capability_id == "SCROLL_HAND":
        return {
            "type": "SCROLL_HAND",
            "delta_x": float(value) if isinstance(value, (int, float)) else 0.0,
            "delta_y": 0.0,
        }

    if capability_id == "TIMELINE_ZOOM":
        zf = float(value) if isinstance(value, (int, float)) else 1.0
        return {"type": "TIMELINE_ZOOM", "zoom_factor": zf}

    if capability_id == "ADD_ELEMENT":
        text = text_content if isinstance(text_content, str) else (
            str(value) if value is not None else ""
        )
        if not text.strip():
            raise _UnmappedParams("text_content required for ADD_ELEMENT")
        return {
            "type": "ADD_ELEMENT",
            "element": {
                "type": "TEXT",
                "text": text,
                "x": 540.0,
                "y": 960.0,
                "startTime": float(start_time) if isinstance(start_time, (int, float)) else 0.0,
                "endTime": float(end_time) if isinstance(end_time, (int, float)) else 5.0,
            },
        }

    # Generic fallbacks for emit-allowed types with simple time fields
    if capability_id == "TRIM":
        if not isinstance(start_time, (int, float)) or not isinstance(end_time, (int, float)):
            raise _UnmappedParams("start_time and end_time required")
        return {"type": "TRIM", "start": float(start_time), "end": float(end_time)}

    if capability_id == "SEEK":
        t = start_time if start_time is not None else value
        if not isinstance(t, (int, float)):
            raise _UnmappedParams("time required")
        return {"type": "SEEK", "time": float(t)}

    if capability_id in {"PLAY", "PAUSE", "EXPORT_CLIP", "RESET_FILTER"}:
        return {"type": capability_id}

    raise _UnmappedParams(f"no mapper for {tool}->{capability_id}")


def assert_registry_valid() -> None:
    """Raise RegistryError if registry/aliases invalid or drift from AiEditorAction."""
    # Clear caches so CI always re-reads disk
    load_registry.cache_clear()
    load_aliases.cache_clear()

    doc = load_registry()
    load_aliases()
    registry_ids = {c["id"] for c in doc["capabilities"]}
    model_ids = _action_discriminator_ids()

    missing_in_registry = sorted(model_ids - registry_ids)
    extra_in_registry = sorted(registry_ids - model_ids)
    if missing_in_registry:
        raise RegistryError(
            f"AiEditorAction types missing from registry: {missing_in_registry}"
        )
    if extra_in_registry:
        raise RegistryError(
            f"Registry ids not in AiEditorAction models: {extra_in_registry}"
        )

    # Alias targets must exist when non-null
    for tool_name, target in load_aliases()["map"].items():
        if target is None:
            continue
        if target not in registry_ids:
            raise RegistryError(
                f"Alias {tool_name} → {target} not present in registry"
            )

    logger.info(
        "capability_registry_valid model_ids=%d registry_ids=%d",
        len(model_ids),
        len(registry_ids),
    )


def list_capabilities_public(*, lite: bool = False) -> dict[str, Any]:
    """Payload for GET /api/capabilities."""
    caps = load_registry()["capabilities"]
    if lite:
        lite_caps = [
            {
                "id": c["id"],
                "title": c["title"],
                "tags": c["tags"],
                "exec_locus": c["exec_locus"],
                "cost_class": c["cost_class"],
                "runtime_status": c["runtime_status"],
                "orchestrator_emit": c["orchestrator_emit"],
            }
            for c in caps
        ]
        return {"version": 1, "capabilities": lite_caps}
    return {"version": 1, "capabilities": caps}


def reload_registry() -> None:
    """Test helper — clear caches."""
    load_registry.cache_clear()
    load_aliases.cache_clear()
