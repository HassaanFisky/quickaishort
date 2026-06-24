"""FastAPI Router for Agent Runtime Health Verification.

Provides endpoints to fetch runtime readiness reports for all agents or a specific agent.
"""

import logging
from fastapi import APIRouter, HTTPException

from services.agent_runtime import get_agent_runtime_report, AGENT_ENV_CONFIGS

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Agent Runtime"])


@router.get("/api/agent-runtime/health")
async def get_all_agents_health():
    """Retrieve runtime readiness checks and environment reports for all agents.

    Ensures that actual secret environment variable values are not exposed in the API payload.
    """
    try:
        report = get_agent_runtime_report(agent_name=None)
        return report
    except Exception as exc:
        logger.error("Failed to generate agent runtime health report: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Failed to generate agent runtime health report."
        )


@router.get("/api/agent-runtime/health/{agent_name}")
async def get_agent_health(agent_name: str):
    """Retrieve runtime readiness checks and environment reports for a specific agent.

    Ensures that actual secret environment variable values are not exposed in the API payload.
    """
    if agent_name not in AGENT_ENV_CONFIGS:
        raise HTTPException(
            status_code=404,
            detail=f"Agent '{agent_name}' not found. Available agents: {list(AGENT_ENV_CONFIGS.keys())}"
        )
    try:
        report = get_agent_runtime_report(agent_name=agent_name)
        return report
    except Exception as exc:
        logger.error("Failed to generate runtime health report for %s: %s", agent_name, exc)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate agent runtime health report for '{agent_name}'."
        )
