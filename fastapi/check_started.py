from redis import Redis
import os
from dotenv import load_dotenv
from rq import Queue

load_dotenv("fastapi/.env")
r = Redis.from_url(os.getenv("REDIS_URL"))
q = Queue("render_queue", connection=r)

started_registry = q.started_job_registry
print(f"Started Job Registry Length: {started_registry.count}")
for job_id in started_registry.get_job_ids():
    print(f" - Started Job ID: {job_id}")
