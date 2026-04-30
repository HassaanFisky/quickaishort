import logging
from typing import TypeVar, Type, Any
from pydantic import BaseModel
from google import genai
from google.genai import types
from google.genai.errors import APIError
from app.config import settings
import json
import asyncio

logger = logging.getLogger(__name__)

T = TypeVar('T', bound=BaseModel)

async def generate_with_fallback(
    prompt: str,
    response_schema: Type[T],
    temperature: float = 0.7
) -> T:
    """
    Centralized model router.
    Attempts generation with GEMINI_MODEL_FAST.
    Falls back to GEMINI_MODEL_REASONING on failure.
    """
    client = genai.Client()
    
    def _call(model_name: str) -> T:
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=response_schema,
                temperature=temperature,
            ),
        )
        data = json.loads(response.text)
        return response_schema(**data)

    try:
        # Try Fast Model
        return await asyncio.to_thread(_call, settings.GEMINI_MODEL_FAST)
    except Exception as e:
        logger.warning(f"Fast model ({settings.GEMINI_MODEL_FAST}) failed: {e}. Falling back to Reasoning model.")
        
    try:
        # Fallback to Reasoning Model
        return await asyncio.to_thread(_call, settings.GEMINI_MODEL_REASONING)
    except Exception as e:
        logger.error(f"Reasoning model ({settings.GEMINI_MODEL_REASONING}) also failed: {e}")
        raise RuntimeError(f"Vertex AI routing failed completely. Last error: {e}")
