"""Local-first zero-daemon persistence and storage adapters.

Provides embedded SQLite persistence for Firestore/collections,
local filesystem object storage for GCS, in-memory cache/locks for Redis,
and fallback for background tasks.
Active when LOCAL_FIRST_MODE=true or when cloud credentials / daemons are unavailable.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger(__name__)

# Root directory for local persistence and local storage
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
STUDIO_DATA_DIR = Path(
    os.environ.get(
        "LOCAL_STUDIO_DATA_DIR", str(_REPO_ROOT / ".quickai_studio" / "data")
    )
)
STUDIO_STORAGE_DIR = Path(
    os.environ.get(
        "LOCAL_STUDIO_STORAGE_DIR", str(_REPO_ROOT / ".quickai_studio" / "storage")
    )
)

STUDIO_DATA_DIR.mkdir(parents=True, exist_ok=True)
STUDIO_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
(STUDIO_STORAGE_DIR / "exports").mkdir(parents=True, exist_ok=True)
(STUDIO_STORAGE_DIR / "uploads").mkdir(parents=True, exist_ok=True)

DB_PATH = STUDIO_DATA_DIR / "quickai_studio.db"


def is_local_first_mode() -> bool:
    """Check if local-first mode is enabled (defaulting to True in local/dev if unconfigured)."""
    val = os.getenv("LOCAL_FIRST_MODE")
    if val is not None:
        return val.strip().lower() in {"1", "true", "yes", "on"}
    # If explicitly in production, never local-first
    if os.getenv("ENVIRONMENT", "").strip().lower() == "production":
        return False
    # If no Google credentials or project set, default to True
    if not os.getenv("GOOGLE_APPLICATION_CREDENTIALS") and not os.getenv("K_SERVICE"):
        return True
    return False


class LocalSQLiteDB:
    """Thread-safe SQLite storage mimicking Firestore Document/Collection semantics."""

    def __init__(self, db_path: Path = DB_PATH) -> None:
        self.db_path = db_path
        self._lock = threading.RLock()
        self._init_schema()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._lock:
            conn = self._get_connection()
            try:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS documents (
                        collection TEXT NOT NULL,
                        doc_id TEXT NOT NULL,
                        data_json TEXT NOT NULL,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (collection, doc_id)
                    )
                    """)
                conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_collection_updated
                    ON documents(collection, updated_at DESC)
                    """)
                conn.commit()
            finally:
                conn.close()

    def set_document(self, collection: str, doc_id: str, data: Dict[str, Any]) -> None:
        serialized = json.dumps(data, default=str)
        with self._lock:
            conn = self._get_connection()
            try:
                conn.execute(
                    """
                    INSERT INTO documents (collection, doc_id, data_json, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(collection, doc_id) DO UPDATE SET
                        data_json = excluded.data_json,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    (collection, doc_id, serialized),
                )
                conn.commit()
            finally:
                conn.close()

    def get_document(self, collection: str, doc_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT data_json FROM documents WHERE collection = ? AND doc_id = ?",
                    (collection, doc_id),
                )
                row = cursor.fetchone()
                if row:
                    return json.loads(row["data_json"])
                return None
            finally:
                conn.close()

    def delete_document(self, collection: str, doc_id: str) -> bool:
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute(
                    "DELETE FROM documents WHERE collection = ? AND doc_id = ?",
                    (collection, doc_id),
                )
                conn.commit()
                return cursor.rowcount > 0
            finally:
                conn.close()

    def list_documents(self, collection: str, limit: int = 100) -> List[Dict[str, Any]]:
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT data_json FROM documents WHERE collection = ? ORDER BY updated_at DESC LIMIT ?",
                    (collection, limit),
                )
                rows = cursor.fetchall()
                return [json.loads(r["data_json"]) for r in rows]
            finally:
                conn.close()


class LocalDocumentRef:
    def __init__(self, db: LocalSQLiteDB, collection: str, doc_id: str) -> None:
        self._db = db
        self.collection = collection
        self.id = doc_id

    def set(self, data: Dict[str, Any], merge: bool = False) -> None:
        if merge:
            existing = self._db.get_document(self.collection, self.id) or {}
            existing.update(data)
            self._db.set_document(self.collection, self.id, existing)
        else:
            self._db.set_document(self.collection, self.id, data)

    def update(self, data: Dict[str, Any]) -> None:
        existing = self._db.get_document(self.collection, self.id) or {}
        existing.update(data)
        self._db.set_document(self.collection, self.id, existing)

    def get(self) -> LocalDocumentSnapshot:
        data = self._db.get_document(self.collection, self.id)
        return LocalDocumentSnapshot(self.id, data)

    def delete(self) -> None:
        self._db.delete_document(self.collection, self.id)


class LocalDocumentSnapshot:
    def __init__(self, doc_id: str, data: Optional[Dict[str, Any]]) -> None:
        self.id = doc_id
        self._data = data
        self.exists = data is not None

    def to_dict(self) -> Optional[Dict[str, Any]]:
        return self._data


class LocalCollectionRef:
    def __init__(self, db: LocalSQLiteDB, collection: str) -> None:
        self._db = db
        self.collection_name = collection

    def document(self, doc_id: Optional[str] = None) -> LocalDocumentRef:
        import uuid

        actual_id = doc_id if doc_id else uuid.uuid4().hex
        return LocalDocumentRef(self._db, self.collection_name, actual_id)

    def where(self, field: str, op: str, value: Any) -> LocalQuery:
        q = LocalQuery(self._db, self.collection_name)
        return q.where(field, op, value)

    def stream(self) -> List[LocalDocumentSnapshot]:
        docs = self._db.list_documents(self.collection_name)
        return [LocalDocumentSnapshot(d.get("id", ""), d) for d in docs]


class LocalQuery:
    def __init__(self, db: LocalSQLiteDB, collection: str) -> None:
        self._db = db
        self.collection = collection
        self._filters: List[Tuple[str, str, Any]] = []
        self._limit: Optional[int] = None

    def where(self, field: str, op: str, value: Any) -> LocalQuery:
        self._filters.append((field, op, value))
        return self

    def limit(self, count: int) -> LocalQuery:
        self._limit = count
        return self

    def stream(self) -> List[LocalDocumentSnapshot]:
        docs = self._db.list_documents(self.collection, limit=self._limit or 200)
        matched = []
        for d in docs:
            ok = True
            for f, op, val in self._filters:
                curr = d.get(f)
                if op == "==" and curr != val:
                    ok = False
                    break
                elif op == "!=" and curr == val:
                    ok = False
                    break
            if ok:
                matched.append(LocalDocumentSnapshot(d.get("id", ""), d))
        return matched


class LocalFirestoreClient:
    """Mock Client conforming to google.cloud.firestore.Client interface."""

    def __init__(self, db_path: Path = DB_PATH) -> None:
        self._sqlite = LocalSQLiteDB(db_path)

    def collection(self, name: str) -> LocalCollectionRef:
        return LocalCollectionRef(self._sqlite, name)


class LocalGCSBlob:
    def __init__(self, root_dir: Path, remote_path: str) -> None:
        # Sanitize remote path against traversal
        clean_rel = Path(remote_path.lstrip("/\\")).as_posix()
        if ".." in clean_rel:
            raise ValueError("Path traversal forbidden")
        self.full_path = (root_dir / clean_rel).resolve()
        self.name = remote_path

    def upload_from_filename(
        self, filename: str, content_type: Optional[str] = None
    ) -> None:
        self.full_path.parent.mkdir(parents=True, exist_ok=True)
        if Path(filename).resolve() != self.full_path.resolve():
            shutil.copy2(filename, str(self.full_path))

    def download_to_filename(self, filename: str) -> None:
        if not self.full_path.exists():
            raise FileNotFoundError(f"Blob does not exist: {self.name}")
        Path(filename).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(self.full_path), filename)

    def exists(self) -> bool:
        return self.full_path.exists()

    def generate_signed_url(self, **kwargs: Any) -> str:
        # Local mock signed URL -> file:// path or local route
        return f"/api/local-media/{self.name}"


class LocalGCSBucket:
    def __init__(
        self, root_dir: Path = STUDIO_STORAGE_DIR, name: str = "quickai-local-media"
    ) -> None:
        self.root_dir = root_dir
        self.name = name

    def blob(self, remote_path: str) -> LocalGCSBlob:
        return LocalGCSBlob(self.root_dir, remote_path)


class LocalMemoryRedis:
    """In-memory Redis replacement for standalone local operation."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._data: Dict[str, Any] = {}
        self._hashes: Dict[str, Dict[str, str]] = {}

    def ping(self) -> bool:
        return True

    def get(self, key: str) -> Optional[bytes]:
        with self._lock:
            val = self._data.get(key)
            if val is None:
                return None
            if isinstance(val, bytes):
                return val
            return str(val).encode("utf-8")

    def set(self, key: str, value: Any, ex: Optional[int] = None) -> bool:
        with self._lock:
            self._data[key] = value
            return True

    def setex(self, key: str, time: int, value: Any) -> bool:
        return self.set(key, value, ex=time)

    def delete(self, *keys: str) -> int:
        with self._lock:
            count = 0
            for k in keys:
                if k in self._data:
                    del self._data[k]
                    count += 1
                if k in self._hashes:
                    del self._hashes[k]
                    count += 1
            return count

    def hset(
        self,
        name: str,
        key: Optional[str] = None,
        value: Optional[str] = None,
        mapping: Optional[Dict[str, str]] = None,
    ) -> int:
        with self._lock:
            h = self._hashes.setdefault(name, {})
            count = 0
            if mapping:
                for k, v in mapping.items():
                    h[str(k)] = str(v)
                    count += 1
            if key is not None and value is not None:
                h[str(key)] = str(value)
                count += 1
            return count

    def hget(self, name: str, key: str) -> Optional[bytes]:
        with self._lock:
            h = self._hashes.get(name, {})
            val = h.get(str(key))
            if val is None:
                return None
            return val.encode("utf-8")

    def hgetall(self, name: str) -> Dict[bytes, bytes]:
        with self._lock:
            h = self._hashes.get(name, {})
            return {k.encode("utf-8"): v.encode("utf-8") for k, v in h.items()}

    def pubsub(self, ignore_subscribe_messages: bool = True) -> Any:
        class _LocalPubSub:
            def subscribe(self, *args: Any) -> None:
                pass

            def listen(self) -> Any:
                return []

            def close(self) -> None:
                pass

        return _LocalPubSub()


# Singletons
_local_sqlite = LocalSQLiteDB()
_local_firestore = LocalFirestoreClient()
_local_bucket = LocalGCSBucket()
_local_redis = LocalMemoryRedis()


def get_local_db() -> LocalFirestoreClient:
    return _local_firestore


def get_local_bucket() -> LocalGCSBucket:
    return _local_bucket


def get_local_redis() -> LocalMemoryRedis:
    return _local_redis
