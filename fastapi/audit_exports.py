import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from dotenv import load_dotenv

load_dotenv("fastapi/.env")

MONGODB_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("DB_NAME", "quickaishort")


async def audit_all_exports():
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[DB_NAME]
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="exports")

    print("\nAuditing EXPORTS bucket:")
    count = 0
    async for f in bucket.find({}):
        print(f" - Found: {f.filename} ({f.length} bytes)")
        count += 1

    if count == 0:
        print("!!! NO EXPORTS FOUND !!!")

    client.close()


if __name__ == "__main__":
    asyncio.run(audit_all_exports())
