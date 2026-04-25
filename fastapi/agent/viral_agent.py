
"""
Viral Agent System for QuickAI Shorts
Author: Antigravity
Last Modified: 2026-04-24
"""

import os
import json
import logging
from typing import List
import google.generativeai as genai
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Verified 2026-04-24 via models API — fastest model with JSON mode + 1M context
MODEL_NAME = "gemini-2.0-flash"

class ViralAnalysis(BaseModel):
    score: int
    hookStrength: float
    retentionPotential: float
    emotionalTriggers: List[str]
    reasoning: str

class ClipSuggestion(BaseModel):
    start: float
    end: float
    reason: str
    viralAnalysis: ViralAnalysis
    suggestedCaptions: List[str]

class ViralAgent:
    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(MODEL_NAME)

    async def analyze_transcript(self, transcript_text: str, duration: float) -> List[ClipSuggestion]:
        """
        Uses Gemini to analyze the transcript and suggest viral clips.
        """
        prompt = f"""
        Analyze the following video transcript for viral short-form content (YouTube Shorts/TikTok).
        Video Duration: {duration} seconds
        
        Transcript:
        {transcript_text}
        
        Your task:
        1. Identify the most engaging segments (hooks) that can stand alone.
        2. Assign a viral score (0-100) based on hook strength and retention potential.
        3. Provide specific reasoning for why each clip would go viral.
        4. Suggest 3-5 captions for each clip.
        5. Return the result as a structured JSON list of clips with start/end times in seconds.
        
        Rules:
        - Clips should be between 15-60 seconds.
        - Ensure the 'reasoning' is persuasive for a content creator.
        - The 'score' must follow this ramp: 0-40 weak, 41-70 moderate, 71-89 strong, 90-100 viral.
        """

        try:
            response = await self.model.generate_content_async(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    response_mime_type="application/json",
                )
            )
            
            # 🟡 UNVERIFIED: Direct JSON parsing from Gemini 1.5+ response
            # In a real scenario, we might need to strip markdown backticks if response_mime_type is not supported
            raw_json = response.text
            # Simple validation/parsing would go here
            # For now, we return a mock-structured response if parsing fails or for demonstration
            return self._parse_suggestions(raw_json)
        
        except Exception as e:
            logger.error("ViralAgent.analyze_transcript failed: %s", e)
            return []

    def _parse_suggestions(self, raw_data: str) -> List[ClipSuggestion]:
        """Parse Gemini JSON response into ClipSuggestion list.

        Handles two shapes Gemini may return:
          - bare list: [{...}, {...}]
          - wrapped dict: {"clips": [{...}]} or {"suggestions": [{...}]}
        """
        try:
            data = json.loads(raw_data)
            # Unwrap dict if Gemini returned a wrapper object
            if isinstance(data, dict):
                # Try common wrapper keys before giving up
                for key in ("clips", "suggestions", "items", "results"):
                    if key in data and isinstance(data[key], list):
                        data = data[key]
                        break
                else:
                    logger.error("_parse_suggestions: unexpected dict shape, keys=%s", list(data.keys()))
                    return []
            if not isinstance(data, list):
                logger.error("_parse_suggestions: expected list, got %s", type(data).__name__)
                return []
            return [ClipSuggestion(**item) for item in data]
        except (json.JSONDecodeError, TypeError, KeyError, ValueError) as e:
            logger.error("_parse_suggestions failed: %s", e)
            return []

def get_viral_agent():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable not set")
    return ViralAgent(api_key)
