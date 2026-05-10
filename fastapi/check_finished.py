from redis import Redis
import os
from dotenv import load_dotenv
from rq import Queue

load_dotenv("fastapi/.env")
r = Redis.from_url(os.getenv("REDIS_URL"))
q = Queue("render_queue", connection=r)

print(f"Queue Length: {len(q)}")
finished_registry = q.finished_job_registry
print(f"Finished Job Registry Length: {finished_registry.count}")
for job_id in finished_registry.get_job_ids():
    print(f" - Finished Job ID: {job_id}")
