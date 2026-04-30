"""Director Agent for QuickAIShort.online
Converts scripts or YouTube summaries into structured storyboards and clip candidates.
Author: Antigravity (Senior Engineer)
Date: 2026-04-30
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import List, Optional, Any

from pydantic import BaseModel
import google.genai.types as genai_types

from services.gemini_client import DEFAULT_MODEL

logger = logging.getLogger(__name__)

# --- Guarded ADK Imports ---
try:
    from google.adk.agents import Agent
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    _ADK_OK = True
except ImportError:
    logger.warning("google-adk not installed — Director Agent will be unavailable")
    Agent = object # Placeholder for type hints
    _ADK_OK = False

class StoryboardScene(BaseModel):
    timestamp: str
    duration: float
    visual_description: str
    caption: str
    energy_level: str

class DirectorResult(BaseModel):
    title: str
    storyboard: List[StoryboardScene]
    clip_candidates: List[dict]

class DirectorAgent(Agent if _ADK_OK else object):
    def __init__(
        self, 
        name: str = "DirectorAgent", 
        model: str = DEFAULT_MODEL
    ):
        if not _ADK_OK:
            return

        instruction = """
        You are a Senior Video Director specializing in viral short-form content (9:16).
        Your task is to take a raw script or topic and generate a detailed storyboard.
        
        Analyze the user input and produce a storyboard. 
        Ensure the hook (first 3-5 seconds) is high energy.
        Break the content into scenes of 3-7 seconds each.
        Total duration should be under 60 seconds.
        
        You must also define 'clip_candidates' which are logical segments of the video 
        that can be evaluated for virality.
        
        Output MUST be a valid JSON object matching the DirectorResult schema.
        """
        super().__init__(
            name=name,
            model=model,
            description="Converts input into storyboard and clip candidates.",
            instruction=instruction,
            output_key="director_storyboard",
            generate_content_config={"response_mime_type": "application/json"}
        )

# --- Global Instances (Guarded) ---
director_agent_instance = None
director_runner = None

if _ADK_OK:
    director_agent_instance = DirectorAgent()
    director_runner = Runner(
        agent=director_agent_instance,
        session_service=InMemorySessionService(),
        app_name="QuickAIShort_Director"
    )

async def run_director_pipeline(input_text: str, user_id: str) -> dict:
    """High-level async entry point for the Director Agent."""
    if not _ADK_OK or not director_runner:
        raise RuntimeError("Director pipeline unavailable — google-adk not installed")

    session_id = f"dir-{uuid.uuid4()}"

    await director_runner.session_service.create_session(
        app_name="QuickAIShort_Director",
        user_id=user_id,
        session_id=session_id,
        state={}
    )

    message = genai_types.Content(
        role="user",
        parts=[genai_types.Part(text=f"Create storyboard for: {input_text}")]
    )

    async for event in director_runner.run_async(
        user_id=user_id,
        session_id=session_id,
        new_message=message
    ):
        if event.is_final_response():
            break

    session = await director_runner.session_service.get_session(
        app_name="QuickAIShort_Director",
        user_id=user_id,
        session_id=session_id
    )
    
    raw_result = session.state.get("director_storyboard")
    if not raw_result:
        return {}
        
    try:
        data = json.loads(raw_result) if isinstance(raw_result, str) else raw_result
        # Validate against schema to ensure downstream reliability
        validated = DirectorResult.model_validate(data)
        return validated.model_dump()
    except Exception as exc:
        logger.error("Director output validation failed: %s", exc)
        # Return raw as fallback but log error
        return data if isinstance(data, dict) else {}
