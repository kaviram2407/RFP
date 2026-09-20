from pydantic_settings import BaseSettings, SettingsConfigDict
import os

class Settings(BaseSettings):
    APP_NAME: str = "AI-RFP Platform"
    APP_ENV: str = "development"
    DEBUG: bool = True
    
    # PostgreSQL
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "rfp_db"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/rfp_db"

    # Redis
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT Authentication
    JWT_SECRET_KEY: str = "changeme-in-production-very-secret-key"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_LOGIN: str = "10/minute"
    RATE_LIMIT_AI: str = "20/minute"

    # Storage Provider Configuration (local vs r2)
    STORAGE_PROVIDER: str = "local"  # "local" or "r2"
    LOCAL_STORAGE_DIR: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "storage")

    # File Upload & Cloudflare R2
    MAX_UPLOAD_SIZE_BYTES: int = 52428800  # 50MB default
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = "rfp-documents"
    R2_ENDPOINT_URL: str = ""
    R2_REGION: str = "auto"


    # NVIDIA LLM & Requirement Extraction
    NVIDIA_API_KEY: str = ""
    NVIDIA_BASE_URL: str = "https://integrate.api.nvidia.com/v1"
    NVIDIA_LLM_MODEL: str = "nvidia/nemotron-3-super-120b-a12b"
    LLM_REQUEST_TIMEOUT_SECONDS: int = 120
    REQUIREMENT_EXTRACTION_CONFIDENCE_THRESHOLD: float = 0.7
    REQUIREMENT_EXTRACTION_CONTEXT_SIZE: int = 8000

    # NVIDIA Embeddings & RAG Retrieval
    NVIDIA_EMBEDDING_MODEL: str = "nvidia/nemotron-3-embed-1b"
    NVIDIA_EMBEDDING_DIMENSIONS: int = 2048
    HYBRID_SEARCH_SEMANTIC_WEIGHT: float = 0.70
    HYBRID_SEARCH_LEXICAL_WEIGHT: float = 0.30





    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
