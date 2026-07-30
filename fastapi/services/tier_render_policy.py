"""Server-authoritative Free/Pro render options mutation.

Author: QuickAI Engineering
Last modified: 2026-07-27
"""

from __future__ import annotations

import copy
import logging
import os
from typing import Any

from core.limits import (
    ExportResolution,
    UserTier,
    get_render_policy,
)

logger = logging.getLogger(__name__)

_TRUE = frozenset({"1", "true", "yes", "on"})


def is_tier_render_policy_enforced() -> bool:
    """Emergency escape hatch — default ON in all environments."""
    raw = os.getenv("ENFORCE_TIER_RENDER_POLICY")
    if raw is None:
        return True
    return raw.strip().lower() in _TRUE


def _parse_requested_resolution(options: dict[str, Any]) -> ExportResolution:
    raw = str(options.get("export_resolution") or options.get("quality") or "").lower()
    if raw in {"4k", "uhd", "2160", "2160p"}:
        return ExportResolution.UHD_4K
    if raw in {"720", "720p", "hd"}:
        return ExportResolution.HD_720P
    # quality presets (low/medium/high) are not resolutions — default 1080p request.
    if raw in {"1080", "1080p", "fullhd", "full_hd"}:
        return ExportResolution.FULL_HD_1080P
    # Infer from nested dims when present.
    for nest_key in ("render_manifest", "production_plan"):
        nest = options.get(nest_key)
        if not isinstance(nest, dict):
            continue
        timeline = nest.get("timeline") if nest_key == "render_manifest" else nest
        if not isinstance(timeline, dict):
            continue
        w = int(timeline.get("width") or timeline.get("output_width") or 0)
        h = int(timeline.get("height") or timeline.get("output_height") or 0)
        long_edge = max(w, h)
        if long_edge >= 2160:
            return ExportResolution.UHD_4K
        if long_edge and long_edge <= 1280:
            return ExportResolution.HD_720P
    return ExportResolution.FULL_HD_1080P


def apply_tier_render_policy(
    options: dict[str, Any] | None,
    tier: UserTier,
) -> dict[str, Any]:
    """Deep-copy options and force Free 720p + watermark; Pro keeps request.

    Never mutates the input dict (tests assert identity of nested raw dims).
    """
    raw = options or {}
    guarded = copy.deepcopy(raw)
    if not is_tier_render_policy_enforced():
        logger.warning("ENFORCE_TIER_RENDER_POLICY disabled — skipping tier guard")
        return guarded

    aspect = str(guarded.get("aspect_ratio") or "9:16")
    requested = _parse_requested_resolution(guarded)
    policy = get_render_policy(
        tier,
        aspect_ratio=aspect,
        requested_resolution=requested,
    )

    guarded["export_resolution"] = policy.resolution.value
    guarded["output_width"] = policy.output_width
    guarded["output_height"] = policy.output_height

    if policy.watermark_required:
        guarded["watermark_enabled"] = True
        guarded["watermark_text"] = policy.watermark_text or "Made with QuickAI"
    else:
        # Pro: do not force watermark; leave client preference.
        if "watermark_text" not in guarded:
            guarded["watermark_text"] = None

    manifest = guarded.get("render_manifest")
    if isinstance(manifest, dict):
        timeline = manifest.get("timeline")
        if isinstance(timeline, dict):
            timeline["width"] = policy.output_width
            timeline["height"] = policy.output_height

    plan = guarded.get("production_plan")
    if isinstance(plan, dict):
        plan["output_width"] = policy.output_width
        plan["output_height"] = policy.output_height

    return guarded
