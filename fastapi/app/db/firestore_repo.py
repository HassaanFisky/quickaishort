import datetime
import logging
from typing import Optional, Dict, Any
from google.cloud import firestore

logger = logging.getLogger(__name__)

# Initialize Firestore client
try:
    db = firestore.Client()
except Exception as e:
    logger.warning(f"Failed to initialize Firestore client automatically: {e}")
    db = None

class FirestoreRepo:
    def __init__(self):
        self.db = db

    def get_user(self, uid: str) -> Optional[Dict[str, Any]]:
        if not self.db: return None
        doc_ref = self.db.collection("users").document(uid)
        doc = doc_ref.get()
        return doc.to_dict() if doc.exists else None

    def create_or_update_user(self, uid: str, data: Dict[str, Any]) -> None:
        if not self.db: return
        doc_ref = self.db.collection("users").document(uid)
        data["updated_at"] = firestore.SERVER_TIMESTAMP
        doc_ref.set(data, merge=True)

    def create_job(self, job_id: str, uid: str, data: Dict[str, Any]) -> None:
        if not self.db: return
        doc_ref = self.db.collection("video_jobs").document(job_id)
        payload = {
            "job_id": job_id,
            "uid": uid,
            "created_at": firestore.SERVER_TIMESTAMP,
            "updated_at": firestore.SERVER_TIMESTAMP,
            **data
        }
        doc_ref.set(payload)

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        if not self.db: return None
        doc_ref = self.db.collection("video_jobs").document(job_id)
        doc = doc_ref.get()
        return doc.to_dict() if doc.exists else None

    def update_job(self, job_id: str, data: Dict[str, Any]) -> None:
        if not self.db: return
        doc_ref = self.db.collection("video_jobs").document(job_id)
        data["updated_at"] = firestore.SERVER_TIMESTAMP
        doc_ref.update(data)

    def append_job_event(self, job_id: str, event_id: str, payload: Dict[str, Any]) -> None:
        if not self.db: return
        doc_ref = self.db.collection("job_events").document(job_id).collection("events").document(event_id)
        payload["created_at"] = firestore.SERVER_TIMESTAMP
        doc_ref.set(payload)

    def save_agent_session(self, session_id: str, uid: str, state: str, memory: str) -> None:
        if not self.db: return
        doc_ref = self.db.collection("agent_sessions").document(session_id)
        doc_ref.set({
            "session_id": session_id,
            "uid": uid,
            "state": state,
            "memory": memory,
            "updated_at": firestore.SERVER_TIMESTAMP
        }, merge=True)

    def get_agent_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        if not self.db: return None
        doc_ref = self.db.collection("agent_sessions").document(session_id)
        doc = doc_ref.get()
        return doc.to_dict() if doc.exists else None

    def claim_job_lock(self, job_id: str, lock_id: str) -> bool:
        """
        Attempts to claim a lock on a job using a Firestore transaction.
        Returns True if successful, False if already locked or not found.
        """
        if not self.db: return False
        
        transaction = self.db.transaction()
        doc_ref = self.db.collection("video_jobs").document(job_id)
        
        @firestore.transactional
        def _claim_lock(transaction, doc_ref, lock_id):
            snapshot = doc_ref.get(transaction=transaction)
            if not snapshot.exists:
                return False
                
            data = snapshot.to_dict()
            current_lock = data.get("lock_id")
            
            # If unlocked, claim it
            if not current_lock:
                transaction.update(doc_ref, {
                    "lock_id": lock_id,
                    "status": "RUNNING",
                    "updated_at": firestore.SERVER_TIMESTAMP
                })
                return True
                
            # If already locked by us (idempotent retry), allow it
            if current_lock == lock_id:
                return True
                
            return False

        try:
            return _claim_lock(transaction, doc_ref, lock_id)
        except Exception as e:
            logger.error(f"Failed to claim lock for job {job_id}: {e}")
            return False

    def unlock_job(self, job_id: str, lock_id: str) -> None:
        """
        Releases the lock on a job.
        """
        if not self.db: return
        doc_ref = self.db.collection("video_jobs").document(job_id)
        # Using simple update since releasing doesn't strictly need a read-modify-write if we only clear our own
        try:
            doc_ref.update({
                "lock_id": None,
                "updated_at": firestore.SERVER_TIMESTAMP
            })
        except Exception as e:
            logger.error(f"Failed to unlock job {job_id}: {e}")

    def check_rate_limit(self, uid: str, max_jobs: int = 10, hours: int = 1) -> bool:
        """
        Returns True if the user has created fewer than max_jobs in the last 'hours'.
        """
        if not self.db: return True # fail open if DB is missing for local dev
        
        time_threshold = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours)
        
        # This requires a composite index if scaling, but for MVP simple query works if we sort client-side, 
        # or we just rely on standard indexing if created_at is indexed.
        try:
            jobs_ref = self.db.collection("video_jobs")
            query = jobs_ref.where(filter=firestore.FieldFilter("uid", "==", uid)).where(filter=firestore.FieldFilter("created_at", ">=", time_threshold))
            recent_jobs = list(query.stream())
            return len(recent_jobs) < max_jobs
        except Exception as e:
            logger.error(f"Failed to check rate limit for {uid}: {e}")
            return True # fail open

firestore_repo = FirestoreRepo()
