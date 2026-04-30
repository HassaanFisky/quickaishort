import time
from typing import Optional, Dict, Any
from app.db.firestore_repo import firestore_repo

def structured_log(job_id: str, agent_name: str, decision: str, latency_ms: float, extra: Optional[Dict[str, Any]] = None):
    """
    Creates a structured observability log in Firestore for auditing agent performance and decisions.
    """
    payload = {
        "agent_name": agent_name,
        "decision": decision,
        "latency_ms": latency_ms,
        "timestamp": time.time(),
        "extra": extra or {}
    }
    
    # Store directly into the job_logs collection
    try:
        db = firestore_repo.db
        if db:
            db.collection("job_logs").document(job_id).collection("traces").add(payload)
    except Exception as e:
        # Fallback to local logger if Firestore is down
        import logging
        logging.getLogger(__name__).error(f"Failed to write structured log for {job_id}: {e}")
