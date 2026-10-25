"""Local-first zero-daemon persistence and storage adapters.

Provides embedded SQLite persistence for Firestore/collections,
local filesystem object storage for GCS, in-memory cache/locks for Redis,
and fallback for background tasks.
Active when LOCAL_FIRST_MODE=true or when cloud credentials / daemons are unavailable.
"""

from __future__ import annotations

import copy
import json
import logging
import os
import shutil
import sqlite3
import threading
import time
import uuid
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


def _apply_firestore_transforms(
    existing: Dict[str, Any], updates: Dict[str, Any]
) -> Dict[str, Any]:
    """Apply Firestore field transforms such as Increment cleanly in memory."""
    merged = copy.deepcopy(existing)
    for k, v in updates.items():
        cls_name = type(v).__name__
        if cls_name == "Increment" and hasattr(v, "value"):
            base = merged.get(k, 0)
            try:
                merged[k] = base + v.value
            except TypeError:
                merged[k] = v.value
        elif cls_name == "Sentinel":
            # SERVER_TIMESTAMP sentinel
            merged[k] = datetime.now(timezone.utc).isoformat()
        else:
            merged[k] = v
    return merged


class LocalSQLiteDB:
    """Thread-safe SQLite storage mimicking Firestore Document/Collection semantics."""

    def __init__(self, db_path: Path = DB_PATH) -> None:
        self.db_path = db_path
        self._lock = threading.RLock()
        self._init_schema()

    def _get_connection(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
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
        return [doc for _, doc in self.list_document_records(collection, limit=limit)]

    def list_document_records(
        self, collection: str, limit: int = 200
    ) -> List[Tuple[str, Dict[str, Any]]]:
        with self._lock:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT doc_id, data_json FROM documents WHERE collection = ? ORDER BY updated_at DESC LIMIT ?",
                    (collection, limit),
                )
                rows = cursor.fetchall()
                return [(str(r["doc_id"]), json.loads(r["data_json"])) for r in rows]
            finally:
                conn.close()


class LocalDocumentRef:
    def __init__(self, db: LocalSQLiteDB, collection: str, doc_id: str) -> None:
        self._db = db
        self.collection_name = collection
        self.id = doc_id

    def collection(self, subcollection_name: str) -> LocalCollectionRef:
        return LocalCollectionRef(
            self._db, f"{self.collection_name}/{self.id}/{subcollection_name}"
        )

    def set(self, data: Dict[str, Any], merge: bool = False) -> None:
        if merge:
            existing = self._db.get_document(self.collection_name, self.id) or {}
            merged = _apply_firestore_transforms(existing, data)
            self._db.set_document(self.collection_name, self.id, merged)
        else:
            cleaned = _apply_firestore_transforms({}, data)
            self._db.set_document(self.collection_name, self.id, cleaned)

    def update(self, data: Dict[str, Any]) -> None:
        existing = self._db.get_document(self.collection_name, self.id) or {}
        merged = _apply_firestore_transforms(existing, data)
        self._db.set_document(self.collection_name, self.id, merged)

    def get(self, transaction: Any = None) -> LocalDocumentSnapshot:
        _ = transaction
        data = self._db.get_document(self.collection_name, self.id)
        return LocalDocumentSnapshot(self.id, data, reference=self)

    def delete(self) -> None:
        self._db.delete_document(self.collection_name, self.id)


class LocalDocumentSnapshot:
    def __init__(
        self,
        doc_id: str,
        data: Optional[Dict[str, Any]],
        reference: Optional[LocalDocumentRef] = None,
    ) -> None:
        self.id = doc_id
        self._data = data
        self.exists = data is not None
        self.reference = reference

    def to_dict(self) -> Optional[Dict[str, Any]]:
        return copy.deepcopy(self._data) if self._data is not None else None


class LocalCollectionRef:
    def __init__(self, db: LocalSQLiteDB, collection: str) -> None:
        self._db = db
        self.collection_name = collection

    def document(self, doc_id: Optional[str] = None) -> LocalDocumentRef:
        actual_id = str(doc_id) if doc_id else uuid.uuid4().hex
        return LocalDocumentRef(self._db, self.collection_name, actual_id)

    def add(
        self, document_data: Dict[str, Any], document_id: Optional[str] = None
    ) -> Tuple[Any, LocalDocumentRef]:
        doc_ref = self.document(document_id)
        doc_ref.set(document_data)
        return datetime.now(timezone.utc), doc_ref

    def where(
        self,
        field: Optional[str] = None,
        op: Optional[str] = None,
        value: Any = None,
        *,
        filter: Any = None,
    ) -> LocalQuery:
        q = LocalQuery(self._db, self.collection_name)
        return q.where(field, op, value, filter=filter)

    def order_by(self, field: str, direction: Any = "ASCENDING") -> LocalQuery:
        q = LocalQuery(self._db, self.collection_name)
        return q.order_by(field, direction=direction)

    def limit(self, count: int) -> LocalQuery:
        q = LocalQuery(self._db, self.collection_name)
        return q.limit(count)

    def stream(self) -> List[LocalDocumentSnapshot]:
        records = self._db.list_document_records(self.collection_name, limit=500)
        return [
            LocalDocumentSnapshot(
                doc_id or str(d.get("id", "")),
                d,
                reference=LocalDocumentRef(self._db, self.collection_name, doc_id),
            )
            for doc_id, d in records
        ]


def _match_filter(curr: Any, op: str, val: Any) -> bool:
    if op == "==":
        return curr == val
    if op == "!=":
        return curr != val
    if op == "in":
        return isinstance(val, (list, tuple, set)) and curr in val
    if curr is None:
        return False
    try:
        if op == ">":
            return curr > val
        if op == ">=":
            return curr >= val
        if op == "<":
            return curr < val
        if op == "<=":
            return curr <= val
    except TypeError:
        return str(curr) > str(val) if op in (">", ">=") else False
    return True


class LocalQuery:
    def __init__(self, db: LocalSQLiteDB, collection: str) -> None:
        self._db = db
        self.collection = collection
        self._filters: List[Tuple[str, str, Any]] = []
        self._orders: List[Tuple[str, bool]] = []
        self._limit: Optional[int] = None

    def where(
        self,
        field: Optional[str] = None,
        op: Optional[str] = None,
        value: Any = None,
        *,
        filter: Any = None,
    ) -> LocalQuery:
        if filter is not None and hasattr(filter, "field_path"):
            self._filters.append(
                (str(filter.field_path), str(filter.op_string), filter.value)
            )
        elif field is not None and op is not None:
            self._filters.append((field, op, value))
        return self

    def order_by(self, field: str, direction: Any = "ASCENDING") -> LocalQuery:
        desc = str(direction).upper().endswith("DESCENDING") or str(direction) == "DESC"
        self._orders.append((field, desc))
        return self

    def limit(self, count: int) -> LocalQuery:
        self._limit = count
        return self

    def stream(self) -> List[LocalDocumentSnapshot]:
        records = self._db.list_document_records(self.collection, limit=1000)
        matched: List[Tuple[str, Dict[str, Any]]] = []
        for doc_id, d in records:
            ok = True
            for f, op, val in self._filters:
                curr = d.get(f)
                if not _match_filter(curr, op, val):
                    ok = False
                    break
            if ok:
                matched.append((doc_id, d))

        for field, desc in reversed(self._orders):
            matched.sort(
                key=lambda item: (item[1].get(field) is None, item[1].get(field, "")),
                reverse=desc,
            )

        if self._limit is not None:
            matched = matched[: self._limit]

        return [
            LocalDocumentSnapshot(
                doc_id or str(d.get("id", "")),
                d,
                reference=LocalDocumentRef(self._db, self.collection, doc_id),
            )
            for doc_id, d in matched
        ]


class LocalTransaction:
    """Transaction object compatible with @google.cloud.firestore.transactional."""

    def __init__(
        self, db: LocalSQLiteDB, max_attempts: int = 5, read_only: bool = False
    ) -> None:
        self._db = db
        self._max_attempts = max_attempts
        self._read_only = read_only
        self._id: Optional[bytes] = None
        self._write_ops: List[Any] = []

    @property
    def in_progress(self) -> bool:
        return self._id is not None

    @property
    def id(self) -> Optional[bytes]:
        return self._id

    def _clean_up(self) -> None:
        self._id = None
        self._write_ops.clear()

    def _begin(self, retry_id: Optional[bytes] = None) -> None:
        _ = retry_id
        self._id = uuid.uuid4().bytes
        self._write_ops.clear()

    def _commit(self) -> list:
        with self._db._lock:
            for fn in self._write_ops:
                fn()
        self._clean_up()
        return []

    def _rollback(self) -> None:
        self._clean_up()

    def get(self, ref: LocalDocumentRef) -> LocalDocumentSnapshot:
        return ref.get()

    def set(
        self, ref: LocalDocumentRef, document_data: Dict[str, Any], merge: bool = False
    ) -> None:
        data_copy = copy.deepcopy(document_data)
        self._write_ops.append(lambda: ref.set(data_copy, merge=merge))

    def update(self, ref: LocalDocumentRef, field_updates: Dict[str, Any]) -> None:
        updates_copy = copy.deepcopy(field_updates)
        self._write_ops.append(lambda: ref.update(updates_copy))

    def delete(self, ref: LocalDocumentRef) -> None:
        self._write_ops.append(lambda: ref.delete())

    def commit(self) -> list:
        return self._commit()


class LocalFirestoreClient:
    """Client conforming to google.cloud.firestore.Client interface backed by SQLite."""

    def __init__(self, db_path: Path = DB_PATH) -> None:
        self._sqlite = LocalSQLiteDB(db_path)

    def collection(self, name: str) -> LocalCollectionRef:
        return LocalCollectionRef(self._sqlite, name)

    def transaction(self, **kwargs: Any) -> LocalTransaction:
        return LocalTransaction(
            self._sqlite,
            max_attempts=int(kwargs.get("max_attempts", 5)),
            read_only=bool(kwargs.get("read_only", False)),
        )

    def batch(self) -> LocalTransaction:
        return LocalTransaction(self._sqlite)


class LocalGCSBlob:
    def __init__(self, root_dir: Path, remote_path: str) -> None:
        # Sanitize remote path against traversal
        clean_rel = Path(remote_path.lstrip("/\\")).as_posix()
        if ".." in clean_rel.split("/"):
            raise ValueError("Path traversal forbidden")
        self.full_path = (root_dir / clean_rel).resolve()
        if (
            root_dir.resolve() not in self.full_path.parents
            and self.full_path != root_dir.resolve()
        ):
            raise ValueError("Path traversal forbidden")
        self.name = remote_path
        self._size: Optional[int] = None

    @property
    def size(self) -> int:
        if self._size is not None:
            return self._size
        if self.full_path.exists():
            return self.full_path.stat().st_size
        return 0

    def reload(self) -> None:
        if self.full_path.exists():
            self._size = self.full_path.stat().st_size
        else:
            self._size = 0

    def open(self, mode: str = "rb", **kwargs: Any):
        return open(self.full_path, mode, **kwargs)

    def upload_from_filename(
        self, filename: str, content_type: Optional[str] = None
    ) -> None:
        _ = content_type
        self.full_path.parent.mkdir(parents=True, exist_ok=True)
        if Path(filename).resolve() != self.full_path.resolve():
            shutil.copy2(filename, str(self.full_path))
        self.reload()

    def upload_from_string(
        self, data: Union[bytes, str], content_type: Optional[str] = None
    ) -> None:
        _ = content_type
        self.full_path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(data, str):
            self.full_path.write_text(data, encoding="utf-8")
        else:
            self.full_path.write_bytes(data)
        self.reload()

    def download_to_filename(self, filename: str) -> None:
        if not self.full_path.exists():
            raise FileNotFoundError(f"Blob does not exist: {self.name}")
        Path(filename).parent.mkdir(parents=True, exist_ok=True)
        if Path(filename).resolve() != self.full_path.resolve():
            shutil.copy2(str(self.full_path), filename)

    def download_as_bytes(self) -> bytes:
        if not self.full_path.exists():
            raise FileNotFoundError(f"Blob does not exist: {self.name}")
        return self.full_path.read_bytes()

    def delete(self) -> None:
        if self.full_path.exists():
            self.full_path.unlink(missing_ok=True)

    def exists(self) -> bool:
        return self.full_path.exists()

    def generate_signed_url(self, **kwargs: Any) -> str:
        method = str(kwargs.get("method", "GET")).upper()
        clean = self.name.lstrip("/")
        if method == "PUT":
            return f"/api/local-media/put/{clean}"
        return f"/api/local-media/{clean}"


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
        self._zsets: Dict[str, Dict[str, float]] = {}
        self._sets: Dict[str, set] = {}
        self._streams: Dict[str, List[Tuple[bytes, Dict[bytes, bytes]]]] = {}

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

    def set(
        self,
        key: str,
        value: Any,
        ex: Optional[int] = None,
        nx: bool = False,
        **kwargs: Any,
    ) -> Any:
        _ = ex, kwargs
        with self._lock:
            if nx and key in self._data:
                return None
            self._data[key] = value
            return True

    def setex(self, key: str, time_sec: int, value: Any) -> bool:
        return bool(self.set(key, value, ex=time_sec))

    def expire(self, key: str, seconds: int) -> bool:
        _ = key, seconds
        return True

    def incr(self, key: str) -> int:
        with self._lock:
            val = int(self._data.get(key, 0) or 0) + 1
            self._data[key] = str(val)
            return val

    def decr(self, key: str) -> int:
        with self._lock:
            val = int(self._data.get(key, 0) or 0) - 1
            self._data[key] = str(val)
            return val

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
                if k in self._zsets:
                    del self._zsets[k]
                    count += 1
                if k in self._sets:
                    del self._sets[k]
                    count += 1
            return count

    def hset(
        self,
        name: str,
        key: Optional[str] = None,
        value: Optional[str] = None,
        mapping: Optional[Dict[str, Any]] = None,
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

    def zadd(self, name: str, mapping: Dict[str, float]) -> int:
        with self._lock:
            z = self._zsets.setdefault(name, {})
            added = 0
            for member, score in mapping.items():
                if str(member) not in z:
                    added += 1
                z[str(member)] = float(score)
            return added

    def zrem(self, name: str, *values: Any) -> int:
        with self._lock:
            z = self._zsets.get(name, {})
            removed = 0
            for v in values:
                if str(v) in z:
                    del z[str(v)]
                    removed += 1
            return removed

    def zcard(self, name: str) -> int:
        with self._lock:
            return len(self._zsets.get(name, {}))

    def zremrangebyscore(self, name: str, min_score: float, max_score: float) -> int:
        with self._lock:
            z = self._zsets.get(name, {})
            to_remove = [
                k
                for k, score in z.items()
                if float(min_score) <= score <= float(max_score)
            ]
            for k in to_remove:
                del z[k]
            return len(to_remove)

    def sadd(self, name: str, *values: Any) -> int:
        with self._lock:
            s = self._sets.setdefault(name, set())
            before = len(s)
            for v in values:
                s.add(str(v))
            return len(s) - before

    def scard(self, name: str) -> int:
        with self._lock:
            return len(self._sets.get(name, set()))

    def sismember(self, name: str, value: Any) -> bool:
        with self._lock:
            return str(value) in self._sets.get(name, set())

    def srem(self, name: str, *values: Any) -> int:
        with self._lock:
            s = self._sets.get(name, set())
            removed = 0
            for v in values:
                if str(v) in s:
                    s.remove(str(v))
                    removed += 1
            return removed

    def llen(self, name: str) -> int:
        _ = name
        return 0

    def xgroup_create(
        self, name: str, groupname: str, id: str = "$", mkstream: bool = False
    ) -> bool:
        _ = name, groupname, id, mkstream
        return True

    def xadd(
        self,
        name: str,
        fields: Dict[str, Any],
        maxlen: Optional[int] = None,
        approximate: bool = True,
    ) -> bytes:
        _ = approximate
        with self._lock:
            stream = self._streams.setdefault(name, [])
            msg_id = f"{int(time.time() * 1000)}-{len(stream)}".encode("utf-8")
            encoded = {
                str(k).encode("utf-8"): str(v).encode("utf-8")
                for k, v in fields.items()
            }
            stream.append((msg_id, encoded))
            if maxlen and len(stream) > maxlen:
                del stream[:-maxlen]
            return msg_id

    def xrange(
        self, name: str, min: str = "-", max: str = "+", count: Optional[int] = None
    ) -> List[Tuple[bytes, Dict[bytes, bytes]]]:
        _ = min, max
        with self._lock:
            items = list(self._streams.get(name, []))
            return items[:count] if count else items

    def publish(self, channel: str, message: Any) -> int:
        _ = channel, message
        return 1

    def eval(self, script: str, numkeys: int, *keys_and_args: Any) -> Any:
        with self._lock:
            if not keys_and_args:
                return 0
            key = str(keys_and_args[0])
            if "DEL" in script:
                token = str(keys_and_args[1]) if len(keys_and_args) > 1 else ""
                curr = self._data.get(key)
                if curr is not None and (
                    curr == token
                    or (
                        isinstance(curr, bytes)
                        and curr.decode("utf-8", "ignore") == token
                    )
                ):
                    self._data.pop(key, None)
                    return 1
                return 0
            # Token bucket fallback: always admit in local memory mode
            capacity = float(keys_and_args[1]) if len(keys_and_args) > 1 else 10.0
            return [1, capacity - 1.0, 0]

    def pubsub(self, ignore_subscribe_messages: bool = True) -> Any:
        _ = ignore_subscribe_messages

        class _LocalPubSub:
            def subscribe(self, *args: Any) -> None:
                pass

            def unsubscribe(self, *args: Any) -> None:
                pass

            def get_message(self, timeout: float = 0.0) -> None:
                _ = timeout
                return None

            def listen(self) -> Any:
                return []

            def close(self) -> None:
                pass

        return _LocalPubSub()


class LocalAsyncMemoryRedis:
    """Async wrapper around LocalMemoryRedis for async Redis callers."""

    def __init__(self, sync_redis: LocalMemoryRedis) -> None:
        self._sync = sync_redis

    async def ping(self) -> bool:
        return self._sync.ping()

    async def get(self, key: str) -> Optional[str]:
        raw = self._sync.get(key)
        return raw.decode("utf-8") if isinstance(raw, bytes) else raw

    async def set(
        self,
        key: str,
        value: Any,
        ex: Optional[int] = None,
        nx: bool = False,
        **kwargs: Any,
    ) -> Any:
        return self._sync.set(key, value, ex=ex, nx=nx, **kwargs)

    async def setex(self, key: str, time_sec: int, value: Any) -> bool:
        return self._sync.setex(key, time_sec, value)

    async def expire(self, key: str, seconds: int) -> bool:
        return self._sync.expire(key, seconds)

    async def incr(self, key: str) -> int:
        return self._sync.incr(key)

    async def decr(self, key: str) -> int:
        return self._sync.decr(key)

    async def delete(self, *keys: str) -> int:
        return self._sync.delete(*keys)

    async def sadd(self, name: str, *values: Any) -> int:
        return self._sync.sadd(name, *values)

    async def scard(self, name: str) -> int:
        return self._sync.scard(name)

    async def sismember(self, name: str, value: Any) -> bool:
        return self._sync.sismember(name, value)

    async def srem(self, name: str, *values: Any) -> int:
        return self._sync.srem(name, *values)

    async def eval(self, script: str, numkeys: int, *keys_and_args: Any) -> Any:
        return self._sync.eval(script, numkeys, *keys_and_args)


# Singletons
_local_sqlite = LocalSQLiteDB()
_local_firestore = LocalFirestoreClient()
_local_bucket = LocalGCSBucket()
_local_redis = LocalMemoryRedis()
_local_async_redis = LocalAsyncMemoryRedis(_local_redis)


def get_local_db() -> LocalFirestoreClient:
    return _local_firestore


def get_local_bucket() -> LocalGCSBucket:
    return _local_bucket


def get_local_redis() -> LocalMemoryRedis:
    return _local_redis


def get_local_async_redis() -> LocalAsyncMemoryRedis:
    return _local_async_redis
