import asyncio
import os
import uuid
import time
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from redis import Redis
from rq import Queue
from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("DB_NAME", "quickaishort")
REDIS_URL = os.getenv("REDIS_URL")

async def run_e2e_test():
    print("Starting E2E Verification...")
    
    # 1. GridFS Upload (Direct)
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[DB_NAME]
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="uploads")
    
    user_id = "verification_agent"
    job_id = f"test_{uuid.uuid4().hex[:8]}"
    remote_path = f"adk_uploads/{user_id}/{job_id}.mp4"
    
    dummy_video = Path("test_video.mp4")
    if not dummy_video.exists():
        print("Creating test video...")
        os.system("ffmpeg -y -f lavfi -i color=c=black:s=1080x1920:d=1 -vcodec libx264 -pix_fmt yuv420p test_video.mp4")
    
    print(f"Uploading to GridFS: {remote_path}")
    with open(dummy_video, "rb") as f:
        await bucket.upload_from_stream(remote_path, f, metadata={"contentType": "video/mp4"})
    
    # 2. Build Production Plan
    plan = {
        "segments": [
            {
                "start_sec": 0,
                "end_sec": 1,
                "clip_source": f"gridfs://{remote_path}"
            }
        ],
        "voiceover_path": None
    }
    
    # 3. Enqueue Job
    print(f"Enqueueing job {job_id} to Redis...")
    r = Redis.from_url(REDIS_URL)
    q = Queue("render_queue", connection=r)
    
    job = q.enqueue(
        "render_worker.process_render_task",
        job_id=job_id,
        video_id="verification_video",
        start_sec=0,
        end_sec=1,
        user_id=user_id,
        options={"production_plan": plan}
    )
    
    print(f"Job enqueued! ID: {job.id}")
    print(f"MONITOR CLOUD RUN LOGS NOW: gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=quickaishort-worker' --limit 20")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(run_e2e_test())
