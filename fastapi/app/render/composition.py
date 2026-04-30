import logging
import os
import uuid
from typing import Dict
from app.models.schemas import Storyboard
from app.render.ffmpeg_renderer import extract_clip, crop_and_scale_9_16, concat_videos, add_audio_track, burn_subtitles
from app.render.timeline_compiler import compile_timeline
from app.storage.gcs_repo import gcs_repo
from app.audio.text_to_speech import synthesize_speech

logger = logging.getLogger(__name__)

def compose_video(job_id: str, storyboard: Storyboard, resolved_assets: Dict[str, str], generate_voiceover: bool = True) -> str:
    """
    Orchestrates the FFmpeg pipeline to assemble the final video.
    Returns the path to the final assembled MP4.
    """
    output_dir = f"/tmp/{job_id}"
    os.makedirs(output_dir, exist_ok=True)
    
    clip_paths = []
    
    # 1. Compile Timeline deterministically
    timeline = compile_timeline(storyboard, resolved_assets)
    
    # 2. Process each timeline instruction
    for instruction in timeline:
        idx = instruction["scene_index"]
        asset_path = instruction["source_path"]
        
        local_asset = asset_path
        # If it's a GCS path, download it first
        if asset_path.startswith("gs://"):
            local_asset = f"{output_dir}/raw_scene_{idx}.mp4"
            bucket_and_path = asset_path.replace("gs://", "").split("/", 1)
            if len(bucket_and_path) == 2:
                gcs_repo.download_file(bucket_and_path[1], local_asset)

        # Extract timing deterministically
        extracted_path = f"{output_dir}/ext_scene_{idx}.mp4"
        success = extract_clip(local_asset, instruction["source_start_sec"], instruction["source_end_sec"], extracted_path)
        if not success:
            continue
            
        # Format to 9:16
        formatted_path = f"{output_dir}/fmt_scene_{idx}.mp4"
        success = crop_and_scale_9_16(extracted_path, formatted_path)
        if not success:
            continue
            
        # Burn Subtitles
        final_scene_path = f"{output_dir}/final_scene_{idx}.mp4"
        caption = instruction.get("caption", "")
        if caption:
            if burn_subtitles(formatted_path, caption, final_scene_path):
                clip_paths.append(final_scene_path)
            else:
                clip_paths.append(formatted_path)
        else:
            clip_paths.append(formatted_path)
            
    # 2. Concat all formatted clips
    video_only_path = f"{output_dir}/video_only.mp4"
    if not concat_videos(clip_paths, video_only_path):
        raise RuntimeError("Video concatenation failed.")
        
    # 3. Handle Voiceover
    final_output_path = f"{output_dir}/final.mp4"
    if generate_voiceover:
        full_script = " ".join([scene.narration for scene in storyboard.scenes if scene.narration])
        if full_script:
            audio_path = f"{output_dir}/voiceover.mp3"
            if synthesize_speech(full_script, audio_path):
                add_audio_track(video_only_path, audio_path, final_output_path)
            else:
                os.rename(video_only_path, final_output_path)
        else:
            os.rename(video_only_path, final_output_path)
    else:
        os.rename(video_only_path, final_output_path)
        
    return final_output_path
