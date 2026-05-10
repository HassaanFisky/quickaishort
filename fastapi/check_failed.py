from redis import Redis
import os
from dotenv import load_dotenv
from rq import Queue, Worker

load_dotenv("fastapi/.env")
r = Redis.from_url(os.getenv("REDIS_URL"))
q = Queue("render_queue", connection=r)

print(f"Queue Length: {len(q)}")
failed_registry = q.failed_job_registry
print(f"Failed Job Registry Length: {failed_registry.count}")

for job_id in failed_registry.get_job_ids():
    job = q.fetch_job(job_id)
    if job:
        print(f" - Failed Job ID: {job_id} | Error: {job.exc_info}")
