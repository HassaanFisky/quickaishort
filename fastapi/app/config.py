import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # GCP Project
    GCP_PROJECT_ID: str = os.getenv("GCP_PROJECT_ID", "")
    
    # Storage
    GCS_BUCKET_NAME: str = os.getenv("GCS_BUCKET_NAME", "quickaishort-assets")
    
    # Models
    GEMINI_MODEL_FAST: str = os.getenv("GEMINI_MODEL_FAST", "gemini-2.5-flash")
    GEMINI_MODEL_REASONING: str = os.getenv("GEMINI_MODEL_REASONING", "gemini-2.5-pro")

    # App
    PORT: int = int(os.getenv("PORT", "8000"))
    ALLOWED_ORIGINS: str = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:8000")

    class Config:
        env_file = ".env"

settings = Settings()
