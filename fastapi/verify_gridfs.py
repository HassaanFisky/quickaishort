import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from dotenv import load_dotenv

load_dotenv("fastapi/.env")

MONGODB_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("DB_NAME", "quickaishort")


async def verify_gridfs():
    print(f"Connecting to {MONGODB_URI.split('@')[-1]}...")
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[DB_NAME]

    # Check buckets
    for b_name in ["exports", "uploads"]:
        bucket = AsyncIOMotorGridFSBucket(db, bucket_name=b_name)
        print(f"\nChecking bucket: {b_name}")

        # List files
        files = []
        cursor = bucket.find({}, limit=5)
        async for f in cursor:
            files.append(f)

        print(f"Found {len(files)} recent files.")
        for f in files:
            print(f" - {f.filename} ({f.length} bytes, uploaded: {f.upload_date})")

    client.close()


if __name__ == "__main__":
    asyncio.run(verify_gridfs())
