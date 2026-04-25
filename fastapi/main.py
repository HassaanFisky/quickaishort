from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
import yt_dlp
import uvicorn
import requests
import asyncio
import logging
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

from agent.viral_agent import get_viral_agent

# Lazy import — server still starts if google-adk is not installed
try:
    from agent import run_preflight_pipeline, PreflightResult, ClipCandidate as PreflightClipCandidate
    _ADK_AVAILABLE = True
except ImportError:
    _ADK_AVAILABLE = False
    logger.warning("google-adk not installed — POST /api/preflight will return 503")

app = FastAPI()

# ... (origins and middleware remain same)
origins = [
    "http://localhost:3000",
    "https://quickaishort.online",
    "http://localhost:8000",
    "*" 
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TranscriptChunk(BaseModel):
    text: str
    start: float
    end: float

class AnalyzeRequest(BaseModel):
    videoId: str
    transcript: List[TranscriptChunk]
    duration: float

class ClipCandidateRequest(BaseModel):
    start_sec: float
    end_sec: float
    score: float
    transcript: str

class PreflightRequest(BaseModel):
    youtube_url: str
    user_id: str
    is_premium: bool
    clip_candidates: List[ClipCandidateRequest]

@app.get("/")
def read_root():
    return {"status": "active", "service": "QuickAI Shorts Engine (Python)"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/api/analyze")
async def analyze_video(request: AnalyzeRequest):
    """
    Analyzes the video transcript using Gemini ADK to find viral clips.
    """
    try:
        agent = get_viral_agent()
        transcript_text = " ".join([c.text for c in request.transcript])
        
        suggestions = await agent.analyze_transcript(transcript_text, request.duration)
        
        return {
            "videoId": request.videoId,
            "suggestedClips": suggestions,
            "status": "success"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/info")
# ... (existing get_video_info)
def get_video_info(url: str):
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    
    ydl_opts = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        'quiet': True,
        'no_warnings': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                "id": info.get('id'),
                "title": info.get('title'),
                "duration": info.get('duration'),
                "thumbnail": info.get('thumbnail'),
                "formats": info.get('formats'),
                "url": info.get('url')
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/proxy")
# ... (existing proxy_video)
def proxy_video(url: str):
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    ydl_opts = {'format': 'best[ext=mp4]', 'quiet': True}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            stream_url = info.get('url')
            
            if not stream_url:
                raise HTTPException(status_code=404, detail="Could not retrieve stream URL")
                
            def iterfile():  
                with requests.get(stream_url, stream=True, timeout=30) as r:
                    r.raise_for_status()
                    for chunk in r.iter_content(chunk_size=16384):
                        yield chunk

            return StreamingResponse(
                iterfile(),
                media_type="video/mp4",
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Cross-Origin-Resource-Policy": "cross-origin",
                },
            )

    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/preflight")
async def run_preflight(request: PreflightRequest):
    """
    Pre-Flight: Run simulated audience panel on a clip candidate.
    Free users: 2 personas (genz + millennial), no refinement loop.
    Premium users: full 6-persona panel + loop + BigQuery grounding.
    """
    if not _ADK_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Pre-Flight pipeline unavailable — google-adk not installed on this instance",
        )

    if not request.clip_candidates:
        raise HTTPException(status_code=422, detail="clip_candidates must contain at least one clip")

    # Free users: gate full panel behind premium
    if not request.is_premium and len(request.clip_candidates) > 1:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "preflight_requires_premium",
                "message": "Full 6-persona panel requires a Pro subscription.",
                "upgrade_url": "/pricing",
            },
        )

    candidates = [
        PreflightClipCandidate(
            start_sec=c.start_sec,
            end_sec=c.end_sec,
            score=c.score,
            transcript=c.transcript,
        )
        for c in request.clip_candidates
    ]

    try:
        result = await asyncio.wait_for(
            run_preflight_pipeline(
                youtube_url=request.youtube_url,
                clip_candidates=candidates,
                is_premium=request.is_premium,
                user_id=request.user_id,
            ),
            timeout=120.0,
        )
        return {"preflight_result": result.model_dump()}
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="Pre-Flight analysis timed out after 120 seconds. Try again with a shorter clip.",
        )
    except Exception as exc:
        logger.error("POST /api/preflight failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
