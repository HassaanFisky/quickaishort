"""Unit tests verifying zero-daemon local persistence and AI provider fallback."""

from pathlib import Path
import pytest

from services.local_persistence import (
    LocalSQLiteDB,
    LocalGCSBucket,
    LocalMemoryRedis,
)
from services.ai_intelligence_provider import (
    DeterministicEngine,
    CloudProvider,
    EngineTier,
)


def test_local_sqlite_crud(tmp_path: Path):
    db_file = tmp_path / "test.db"
    db = LocalSQLiteDB(db_file)

    # Insert / Set
    db.set_document("projects", "p1", {"title": "Test Project", "duration": 15.0})

    # Read
    doc = db.get_document("projects", "p1")
    assert doc is not None
    assert doc["title"] == "Test Project"
    assert doc["duration"] == 15.0

    # Update
    db.set_document("projects", "p1", {"title": "Updated", "duration": 30.0})
    updated = db.get_document("projects", "p1")
    assert updated["title"] == "Updated"

    # List
    docs = db.list_documents("projects")
    assert len(docs) == 1

    # Delete
    deleted = db.delete_document("projects", "p1")
    assert deleted is True
    assert db.get_document("projects", "p1") is None


def test_local_storage_bucket(tmp_path: Path):
    bucket = LocalGCSBucket(tmp_path)
    test_file = tmp_path / "sample.mp4"
    test_file.write_text("fake video bytes")

    # Upload
    blob = bucket.blob("uploads/sample.mp4")
    blob.upload_from_filename(str(test_file))
    assert blob.exists()

    # Path traversal protection
    with pytest.raises(ValueError):
        bucket.blob("../secrets.txt")


def test_local_memory_redis():
    redis = LocalMemoryRedis()
    assert redis.ping() is True

    # String operations
    redis.set("key1", "val1")
    assert redis.get("key1") == b"val1"

    # Hash operations
    redis.hset("hash1", mapping={"f1": "v1", "f2": "v2"})
    assert redis.hget("hash1", "f1") == b"v1"
    all_fields = redis.hgetall("hash1")
    assert b"f1" in all_fields

    # Delete
    redis.delete("key1", "hash1")
    assert redis.get("key1") is None


def test_deterministic_engine_actions():
    res = DeterministicEngine.plan_command("remove all dead air and silence")
    assert res["status"] == "success"
    assert res["engine_used"] == EngineTier.LOCAL_DETERMINISTIC.value
    assert any(a["type"] == "REMOVE_SILENCES" for a in res["actions"])

    viral_res = DeterministicEngine.plan_command("create viral shorts reel")
    assert any(a["type"] == "SET_ASPECT_RATIO" for a in viral_res["actions"])


@pytest.mark.asyncio
async def test_cloud_provider_fallback_on_429():
    async def failing_gemini_call():
        raise RuntimeError("429 ResourceExhausted: Quota exceeded for quota metric")

    plan = await CloudProvider.execute_with_fallback(
        failing_gemini_call,
        prompt="remove dead air",
    )
    assert plan["status"] == "success"
    assert plan["engine_used"] == EngineTier.LOCAL_DETERMINISTIC.value
    assert len(plan["actions"]) > 0
