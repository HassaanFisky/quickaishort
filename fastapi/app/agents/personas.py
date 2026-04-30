import logging
import asyncio
from typing import List
from app.models.schemas import Storyboard, PersonaResult
from app.agents.model_router import generate_with_fallback

logger = logging.getLogger(__name__)

PERSONAS = [
    "Gen Z Viewer",
    "Tech Professional",
    "Casual Viewer",
    "MENA Audience",
    "LatAm Audience",
    "Shorts Addict"
]

async def analyze_with_persona(storyboard: Storyboard, persona_name: str) -> PersonaResult:
    """
    Runs a single persona simulation against the given storyboard using the robust model router.
    """
    prompt = f"""
    You are roleplaying as a: {persona_name}.
    Analyze the following storyboard for a short-form video.
    Provide your honest reaction, scoring it on hook strength, clarity, retention, visual match, emotion, and novelty.
    Estimate the exact second you would scroll away (predicted_drop_second).
    Provide edit notes and recommended changes.
    
    Storyboard Data:
    {storyboard.model_dump_json(indent=2)}
    """
    
    try:
        result = await generate_with_fallback(
            prompt=prompt,
            response_schema=PersonaResult,
            temperature=0.7
        )
        # Force the correct persona name to match the roleplay request
        result.persona_name = persona_name
        return result
    except Exception as e:
        logger.error(f"Persona {persona_name} analysis failed: {e}")
        # Safe fallback
        return PersonaResult(
            persona_name=persona_name,
            hook_score=50,
            clarity_score=50,
            retention_score=50,
            visual_match_score=50,
            emotion_score=50,
            novelty_score=50,
            confidence=0.0,
            predicted_drop_second=3.0,
            edit_notes=["Failed to run persona due to Vertex AI routing error."],
            recommended_changes=[]
        )

async def run_all_personas(storyboard: Storyboard) -> List[PersonaResult]:
    """
    Runs all 6 personas concurrently and returns their aggregated results.
    """
    tasks = [analyze_with_persona(storyboard, name) for name in PERSONAS]
    results = await asyncio.gather(*tasks)
    return list(results)
