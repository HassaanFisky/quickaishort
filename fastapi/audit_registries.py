from redis import Redis
import os
from dotenv import load_dotenv
from rq import Worker, Queue

load_dotenv("fastapi/.env")
r = Redis.from_url(os.getenv("REDIS_URL"))

workers = Worker.all(connection=r)
print(f"Active Workers: {len(workers)}")
for w in workers:
    job = w.get_current_job()
    print(f" - Worker: {w.name} | State: {w.get_state()} | Current Job: {job.id if job else 'None'}")

# Also check for registry counts
q = Queue("render_queue", connection=r)
registries = {
    "Started": q.started_job_registry,
    "Finished": q.finished_job_registry,
    "Failed": q.failed_job_registry,
    "Deferred": q.deferred_job_registry,
    "Scheduled": q.scheduled_job_registry
}

for name, reg in registries.items():
    print(f"{name} Registry: {reg.count} jobs")
    if reg.count > 0:
        for jid in reg.get_job_ids():
            print(f"  - {jid}")
