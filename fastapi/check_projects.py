import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("fastapi/.env")

MONGODB_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("DB_NAME", "quickaishort")


async def check_projects():
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[DB_NAME]

    print("\nChecking Projects Collection:")
    cursor = db.projects.find({}, limit=5).sort("createdAt", -1)
    async for p in cursor:
        print(
            f" - ID: {p.get('_id')} | Status: {p.get('status')} | Source: {p.get('videoSource')}"
        )

    client.close()


if __name__ == "__main__":
    asyncio.run(check_projects())
