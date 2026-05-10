from redis import Redis
import os
from dotenv import load_dotenv
from rq import Worker

load_dotenv("fastapi/.env")
r = Redis.from_url(os.getenv("REDIS_URL"))
workers = Worker.all(connection=r)
print(f"Active Workers: {len(workers)}")
for w in workers:
    print(f" - Worker: {w.name} | Queues: {w.queue_names()} | State: {w.get_state()}")
