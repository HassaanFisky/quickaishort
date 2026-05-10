from redis import Redis
import os
from dotenv import load_dotenv
from rq.job import Job

load_dotenv("fastapi/.env")
r = Redis.from_url(os.getenv("REDIS_URL"))

jid = "6459443a453d4e38a1a3f00395403616"

try:
    job = Job.fetch(jid, connection=r)
    print(f"Job {jid}:")
    print(f"  Status: {job.get_status()}")
    print(f"  Enqueued at: {job.enqueued_at}")
    print(f"  Started at: {job.started_at}")
    print(f"  Ended at: {job.ended_at}")
    print(f"  Exc Info: {job.exc_info}")
except Exception as e:
    print(f"Job {jid} not found: {e}")
