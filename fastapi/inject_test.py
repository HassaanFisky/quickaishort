import asyncio
import os
import uuid
import time
from pathlib import Path
from redis import Redis
from rq import Queue
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL")

async def run_e2e_test():
    print("Starting E2E Verification (Canvas Overlays + YouTube Source)...")
    
    user_id = "verification_agent"
    job_id = f"test_{uuid.uuid4().hex[:8]}"
    video_id = "jNQXAC9IVRw" # Me at the zoo (short, fast download)
    
    # 2. Build Job Options with new Canvas Overlays
    options = {
        "aspect_ratio": "9:16",
        "quality": "low",
        "captions_enabled": True,
        "captions_srt": "1\n00:00:00,000 --> 00:00:05,000\nThis is a verification test.",
        "hook_overlay": "Verification Active",
        "canvas_overlays": [
            {
                "type": "text",
                "content": "AGENT VERIFIED",
                "x_pct": 0.1,
                "y_pct": 0.1,
                "scale": 1.5
            },
            {
                "type": "sticker",
                "content": "ROCKET_EMOJI",
                "x_pct": 0.8,
                "y_pct": 0.8,
                "scale": 2.0
            }
        ]
    }
    
    # 3. Enqueue Job
    print(f"Enqueueing job {job_id} to Redis...")
    r = Redis.from_url(REDIS_URL)
    q = Queue("render_queue", connection=r)
    
    job = q.enqueue(
        "render_worker.process_render_task",
        job_id,
        video_id,
        0.0,
        5.0, # 5 second clip
        user_id,
        options,
        job_id=job_id,
        result_ttl=86400,
        failure_ttl=86400
    )
    
    print(f"Job enqueued! ID: {job.id}")
    print(f"Status: {job.get_status()}")
    print(f"Monitor: https://quickaishort-api-946316698978.us-central1.run.app/api/status/{job_id}?user_id={user_id}")
    print("\nCheck worker logs in GCP console or run check_workers.py next.")

if __name__ == "__main__":
    asyncio.run(run_e2e_test())
