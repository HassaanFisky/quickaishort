import logging
from typing import Optional

import firebase_admin
from firebase_admin import auth, credentials
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger(__name__)

# Initialize Firebase Admin SDK
try:
    if not firebase_admin._apps:
        # If running in GCP, default credentials will be used if no cert provided.
        # Otherwise, ensure GOOGLE_APPLICATION_CREDENTIALS is set.
        firebase_admin.initialize_app()
except Exception as e:
    logger.warning(f"Failed to initialize Firebase Admin automatically: {e}")

security = HTTPBearer()

def verify_firebase_token(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    """
    Verify the Firebase ID token and return the decoded token.
    Raises 401 if invalid or expired.
    """
    token = credentials.credentials
    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except Exception as e:
        logger.error(f"Firebase token verification failed: {e}")
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired authentication token."
        )

def get_current_user_id(decoded_token: dict = Depends(verify_firebase_token)) -> str:
    """
    Extracts the user's UID from the verified token.
    """
    uid = decoded_token.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="User ID not found in token.")
    return uid
