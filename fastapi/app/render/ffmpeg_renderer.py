import subprocess
import logging
import os

logger = logging.getLogger(__name__)

def run_ffmpeg(args: list[str]) -> bool:
    """
    Executes an ffmpeg command via subprocess.
    """
    cmd = ["ffmpeg", "-y"] + args
    logger.info(f"Running FFmpeg: {' '.join(cmd)}")
    try:
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode != 0:
            logger.error(f"FFmpeg failed with code {result.returncode}. Stderr:\n{result.stderr}")
            return False
        return True
    except Exception as e:
        logger.error(f"Failed to run FFmpeg: {e}")
        return False

def extract_clip(input_path: str, start_sec: float, end_sec: float, output_path: str) -> bool:
    """
    Extracts a subclip from a video.
    """
    duration = end_sec - start_sec
    args = [
        "-ss", str(start_sec),
        "-i", input_path,
        "-t", str(duration),
        "-c:v", "libx264",
        "-c:a", "aac",
        output_path
    ]
    return run_ffmpeg(args)

def crop_and_scale_9_16(input_path: str, output_path: str) -> bool:
    """
    Crops and scales a video to 1080x1920 (9:16).
    """
    args = [
        "-i", input_path,
        "-vf", "crop=ih*(9/16):ih,scale=1080:1920",
        "-c:v", "libx264",
        "-c:a", "aac",
        output_path
    ]
    return run_ffmpeg(args)

def concat_videos(input_paths: list[str], output_path: str) -> bool:
    """
    Concatenates multiple video files.
    """
    if not input_paths: return False
    
    list_file = "concat_list.txt"
    with open(list_file, "w") as f:
        for path in input_paths:
            f.write(f"file '{os.path.abspath(path)}'\n")
            
    args = [
        "-f", "concat",
        "-safe", "0",
        "-i", list_file,
        "-c", "copy",
        output_path
    ]
    success = run_ffmpeg(args)
    if os.path.exists(list_file):
        os.remove(list_file)
    return success

def add_audio_track(video_path: str, audio_path: str, output_path: str) -> bool:
    """
    Adds an external audio track to a video.
    """
    args = [
        "-i", video_path,
        "-i", audio_path,
        "-c:v", "copy",
        "-c:a", "aac",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-shortest",
        output_path
    ]
    return run_ffmpeg(args)

def burn_subtitles(video_path: str, text: str, output_path: str) -> bool:
    """
    Burns a centered caption text into the video.
    """
    # Simple drawtext filter for centered captions
    # In production, we'd use .ass files for word-level timing
    drawtext = (
        f"drawtext=text='{text}':fontcolor=white:fontsize=64:box=1:boxcolor=black@0.5:"
        "boxborderw=5:x=(w-text_w)/2:y=h-400"
    )
    args = [
        "-i", video_path,
        "-vf", drawtext,
        "-c:a", "copy",
        output_path
    ]
    return run_ffmpeg(args)

