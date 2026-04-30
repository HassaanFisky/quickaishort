from typing import List, Dict, Any
from app.models.schemas import Storyboard

def compile_timeline(storyboard: Storyboard, resolved_assets: Dict[str, str]) -> List[Dict[str, Any]]:
    """
    Deterministically converts a Storyboard into a strict list of FFmpeg instructions.
    This ensures no LLM logic exists during the render execution phase.
    """
    timeline = []
    
    current_time = 0.0
    for idx, scene in enumerate(storyboard.scenes):
        asset_path = resolved_assets.get(scene.id)
        if not asset_path:
            continue
            
        duration = scene.end_sec - scene.start_sec
        if duration <= 0:
            duration = 3.0 # safe fallback
            
        instruction = {
            "scene_index": idx,
            "scene_id": scene.id,
            "source_path": asset_path,
            "source_start_sec": scene.start_sec,
            "source_end_sec": scene.end_sec,
            "duration": duration,
            "target_start_sec": current_time,
            "target_end_sec": current_time + duration,
            "caption": scene.caption_text,
            "transition": scene.transition_type
        }
        
        timeline.append(instruction)
        current_time += duration
        
    return timeline
