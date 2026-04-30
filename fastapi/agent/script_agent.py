import os
import json
import logging
import asyncio
import tempfile
import uuid
import requests
from typing import List, Dict, Any, Optional
from pathlib import Path
from dotenv import load_dotenv

import google.generativeai as genai
from google.cloud import texttospeech

from services.gemini_client import DEFAULT_MODEL

load_dotenv()

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("script_agent")

# Initialize Gemini
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel(DEFAULT_MODEL)

class ScriptAgent:
    def __init__(self):
        try:
            self.tts_client = texttospeech.TextToSpeechClient()
        except Exception as e:
            logger.warning(f"Google Cloud TTS Client could not be initialized: {e}")
            self.tts_client = None
            
        self.search_api_key = os.getenv("GOOGLE_SEARCH_API_KEY")
        self.search_cx = os.getenv("GOOGLE_SEARCH_CX")

    async def segment_script(self, script: str) -> List[Dict[str, Any]]:
        """Breaks script into timed segments with visual cues using Gemini."""
        prompt = f"""
        Analyze this video script and break it into logical timed segments for a short video.
        For each segment, provide:
        1. The text to be spoken.
        2. Approximate start and end time in seconds.
        3. A visual_cue: a short description of what should be shown on screen.

        Script:
        {script}

        Return ONLY a JSON array of objects with keys: "text", "start_sec", "end_sec", "visual_cue".
        Ensure the total duration covers the entire script.
        """
        
        try:
            response = await asyncio.to_thread(model.generate_content, prompt)
            # Extract JSON from response
            text = response.text.strip()
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()
            
            segments = json.loads(text)
            return segments
        except Exception as e:
            logger.error(f"Gemini segmentation failed: {e}")
            # Fallback segment
            return [{"text": script, "start_sec": 0, "end_sec": 10, "visual_cue": "General background"}]

    def find_stock_video(self, query: str) -> Optional[str]:
        """Finds a stock video URL using the Pexels API."""
        api_key = os.getenv("PEXELS_API_KEY")
        if not api_key:
            logger.warning("PEXELS_API_KEY missing. Falling back to black frame.")
            return None

        url = "https://api.pexels.com/videos/search"
        headers = {"Authorization": api_key}
        params = {
            "query": query,
            "per_page": 1,
            "orientation": "portrait", # Optimized for Shorts
            "size": "medium"
        }

        try:
            response = requests.get(url, headers=headers, params=params, timeout=10)
            data = response.json()
            if "videos" in data and len(data["videos"]) > 0:
                # Get the best quality mobile-friendly video file
                video_files = data["videos"][0].get("video_files", [])
                # Prefer 1080x1920 if available
                best_file = next((f for f in video_files if f.get("width") == 1080), video_files[0])
                return best_file.get("link")
        except Exception as e:
            logger.error(f"Pexels stock search failed: {e}")
        
        return None

    def generate_voiceover(self, text: str) -> str:
        """Generates TTS voiceover using Google Cloud TTS."""
        temp_dir = Path(tempfile.gettempdir()) / "qais-voiceovers"
        temp_dir.mkdir(parents=True, exist_ok=True)
        output_path = str(temp_dir / f"vo_{uuid.uuid4().hex}.mp3")
        
        if not self.tts_client:
            logger.error("TTS Client not available. Creating silent fallback.")
            Path(output_path).touch()
            return output_path

        try:
            input_text = texttospeech.SynthesisInput(text=text)
            voice = texttospeech.VoiceSelectionParams(
                language_code="en-US",
                name="en-US-Journey-F"
            )
            audio_config = texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3
            )

            response = self.tts_client.synthesize_speech(
                input=input_text, voice=voice, audio_config=audio_config
            )

            with open(output_path, "wb") as out:
                out.write(response.audio_content)
            
            return output_path
        except Exception as e:
            logger.error(f"TTS generation failed: {e}")
            # Create an empty file as fallback
            Path(output_path).touch()
            return output_path

    async def run(self, user_script: str, clip_paths: List[str]) -> Dict[str, Any]:
        """Executes the full script agent pipeline."""
        logger.info("Starting Script Agent pipeline...")
        
        # 1. Segment Script
        segments = await self.segment_script(user_script)
        
        # 2. Match Clips or Search Stock
        final_segments = []
        clip_index = 0
        
        for seg in segments:
            clip_path = None
            if clip_index < len(clip_paths):
                clip_path = clip_paths[clip_index]
                clip_index += 1
            else:
                # No more user clips, find stock
                stock_url = self.find_stock_video(seg["visual_cue"])
                clip_path = stock_url if stock_url else "BLACK_FRAME"

            final_segments.append({
                **seg,
                "clip_path": clip_path
            })

        # 3. Generate Voiceover
        full_text = " ".join([seg["text"] for seg in segments])
        voiceover_path = self.generate_voiceover(full_text)
        
        total_duration = segments[-1]["end_sec"] if segments else 0
        
        return {
            "segments": final_segments,
            "voiceover_path": voiceover_path,
            "total_duration": float(total_duration)
        }

if __name__ == "__main__":
    # Test stub
    agent = ScriptAgent()
    # Mock run
