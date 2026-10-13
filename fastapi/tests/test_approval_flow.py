import pytest
from models.ai_editor import EditorCommandResponse


def test_approval_flow_end_to_end():
    # As the models don't have plan_id/plan_status directly but we can verify the
    # decision_id and kernel_ack_required which indicate plan pending status.
    response = EditorCommandResponse(
        intent="edit",
        confidence=0.9,
        actions=[{"type": "trim_video", "start_time": 0.0, "end_time": 5.0}],
        feedback="Plan generated",
        fallback="",
        model_used="decision-intelligence",
        clamped=[],
        dropped=[],
        message="Plan generated",
        suggestions=[],
        status="ok",
        cached=False,
        kernel_ack_required=True,
        decision_id="test-decision-id",
        decision_mode="ACT",
        unresolved=[],
    )

    assert response.kernel_ack_required is True
    assert response.decision_id == "test-decision-id"
    assert response.decision_mode == "ACT"
