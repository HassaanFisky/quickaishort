from redis import Redis
import os
from dotenv import load_dotenv

load_dotenv("fastapi/.env")
r = Redis.from_url(os.getenv("REDIS_URL"))

print("Redis Keys:")
for key in r.keys("rq:*"):
    print(f" - {key.decode()} ({r.type(key).decode()})")
    if r.type(key).decode() == "list":
        print(f"   Length: {r.llen(key)}")
