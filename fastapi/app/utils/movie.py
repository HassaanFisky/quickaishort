"""Premium Video Generation Engine for QuickAIShort.online
Powered by MoviePy for complex overlays, transitions, and audio mixing.

Author: Antigravity (Senior Engineer)
Date: 2026-05-04
"""

import os
import logging
from typing import List, Optional
from pathlib import Path
import uuid

try:
    from moviepy.editor import VideoFileClip, concatenate_videoclips, TextClip, CompositeVideoClip, AudioFileClip
    _MOVIEPY_OK = True
except ImportError:
    _MOVIEPY_OK = False

logger = logging.getLogger(__name__)

class MovieEngine:
    """High-level video production engine using MoviePy."""
    
    def __init__(self, workdir: Optional[Path] = None):
        self.workdir = workdir or Path("/tmp") / f"movie-{uuid.uuid4().hex}"
        self.workdir.mkdir(parents=True, exist_ok=True)
        if not _MOVIEPY_OK:
            logger.warning("MoviePy not installed. Please add 'moviepy' to requirements.txt")

    def create_short(
        self, 
        segments: List[dict], 
        voiceover_path: Optional[str] = None,
        output_name: str = "final_short.mp4"
    ) -> str:
        """
        Creates a vertical (9:16) short from segments.
        Segments expected format: [{"path": str, "start": float, "end": float, "caption": str}]
        """
        if not _MOVIEPY_OK:
            raise RuntimeError("MoviePy is required for MovieEngine. Create movie.py task failed.")

        clips = []
        for seg in segments:
            path = seg.get("path")
            if not path or not os.path.exists(path):
                logger.warning(f"Segment path missing: {path}")
                continue
            
            # Load and subclip
            clip = VideoFileClip(path).subclip(seg.get("start", 0), seg.get("end"))
            
            # Resize to vertical 9:16 (1080x1920)
            # We crop the center
            w, h = clip.size
            target_ratio = 9/16
            current_ratio = w/h
            
            if current_ratio > target_ratio:
                # Too wide, crop sides
                new_w = h * target_ratio
                clip = clip.crop(x_center=w/2, width=new_w)
            else:
                # Too tall, crop top/bottom
                new_h = w / target_ratio
                clip = clip.crop(y_center=h/2, height=new_h)
            
            clip = clip.resize(width=1080) # Final width 1080, height will be 1920
            
            # Add caption if present
            caption_text = seg.get("caption")
            if caption_text:
                txt_clip = TextClip(
                    caption_text, 
                    fontsize=70, 
                    color='yellow', 
                    font='Arial-Bold',
                    stroke_color='black',
                    stroke_width=2,
                    method='caption',
                    size=(1000, None)
                ).set_position(('center', 1400)).set_duration(clip.duration)
                clip = CompositeVideoClip([clip, txt_clip])
                
            clips.append(clip)

        if not clips:
            raise ValueError("No valid clips produced")

        final_clip = concatenate_videoclips(clips, method="compose")

        # Audio mixing
        if voiceover_path and os.path.exists(voiceover_path):
            audio_vo = AudioFileClip(voiceover_path)
            # If VO is shorter than video, it will loop or we just set it
            # Usually VO should drive the duration, but here we assume video is timed to VO
            final_audio = CompositeAudioClip([
                final_clip.audio.volumex(0.3), # Background ambient
                audio_vo.volumex(1.5)           # Voiceover
            ])
            final_clip = final_clip.set_audio(final_audio)

        output_path = str(self.workdir / output_name)
        final_clip.write_videofile(
            output_path, 
            codec="libx264", 
            audio_codec="aac", 
            fps=24,
            threads=4,
            logger=None
        )
        
        return output_path

    def cleanup(self):
        import shutil
        if self.workdir.exists():
            shutil.rmtree(self.workdir)

def generate_premium_movie(production_plan: dict) -> str:
    """Wrapper for external calls."""
    engine = MovieEngine()
    try:
        segments = production_plan.get("segments", [])
        vo_path = production_plan.get("voiceover_path")
        return engine.create_short(segments, vo_path)
    except Exception as e:
        logger.error(f"MovieEngine failed: {e}")
        raise
