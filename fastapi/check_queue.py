from redis import Redis
import os
from dotenv import load_dotenv

load_dotenv("fastapi/.env")
r = Redis.from_url(os.getenv("REDIS_URL"))
print(f"Queue Length: {r.llen('rq:queue:render_queue')}")
