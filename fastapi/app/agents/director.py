import logging
from app.models.schemas import Storyboard
from app.agents.model_router import generate_with_fallback

logger = logging.getLogger(__name__)

async def generate_storyboard(input_text: str, input_type: str, target_duration: float = 60.0) -> Storyboard:
    """
    Analyzes the input text (script or transcript) and outputs a detailed Storyboard JSON.
    Uses the model router for fallback logic.
    """
    prompt = f"""
    You are an expert short-form video director. 
    Analyze the following {input_type} and convert it into a highly engaging Storyboard.
    Target duration: {target_duration} seconds.
    Keep scenes fast-paced (usually 2-5 seconds each).
    
    Content to analyze:
    {input_text}
    """
    
    try:
        return await generate_with_fallback(
            prompt=prompt,
            response_schema=Storyboard,
            temperature=0.7
        )
    except Exception as e:
        logger.error(f"Director Agent failed to generate storyboard: {e}")
        # Safe fallback
        return Storyboard(
            video_type="fallback",
            target_duration_sec=target_duration,
            scenes=[]
        )
