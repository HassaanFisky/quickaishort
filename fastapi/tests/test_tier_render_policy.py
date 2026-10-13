import pytest
from services.tier_render_policy import apply_tier_render_policy
from core.limits import UserTier


def test_tier_render_dimensions():
    # Test that Pro passes custom dimensions
    options = {"output_width": 1080, "output_height": 1920, "quality": "1080p"}
    pro = apply_tier_render_policy(options, UserTier.PRO)
    assert pro["output_width"] == 1080
    assert pro["output_height"] == 1920

    # Test that Free is forced to 720p (720x1280) when requesting 1080p
    free = apply_tier_render_policy(options, UserTier.FREE)
    assert free["output_width"] == 720
    assert free["output_height"] == 1280
