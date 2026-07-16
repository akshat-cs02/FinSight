"""
Configuration management for FinSight application
"""

from typing import List
from pydantic_settings import BaseSettings
from pydantic import Field
import logging
import os

logger = logging.getLogger(__name__)

# Insecure placeholder values shipped for local dev. If any of these survive
# into a production deployment, startup fails loudly (see validate_security()).
_INSECURE_DEFAULTS = {
    "SECRET_KEY": "your-secret-key-change-in-production",
    "ADMIN_PASSWORD": "admin123",
    "ADMIN_API_KEY": "admin-api-key",
}

class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # App Configuration
    APP_NAME: str = "FinSight"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    # Opt INTO production explicitly (ENVIRONMENT=production). Local dev is the
    # safe default so insecure placeholder secrets only warn, never run in prod.
    ENVIRONMENT: str = "development"

    # Database
    # SQLite (default):   sqlite:///./data/finsight.db
    # PostgreSQL:         postgresql://user:pass@host:5432/finsight
    DATABASE_URL: str = "sqlite:///./data/finsight.db"

    # JWT & Security
    SECRET_KEY: str = Field(default="your-secret-key-change-in-production")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    BCRYPT_LOG_ROUNDS: int = 12
    # Hard-reject tokens whose device/network fingerprint no longer matches.
    # Off by default so legit IP/UA changes (mobile, VPN) don't lock users out;
    # mismatches are always logged. Turn on for strict anti-theft in production.
    ENFORCE_TOKEN_FINGERPRINT: bool = False
    # Require a valid JWT on the market WebSocket. Off by default because the
    # bundled frontend ticker connects anonymously; flip on once it sends a token.
    WS_REQUIRE_AUTH: bool = False

    # CORS — explicit origins only. A wildcard "*" combined with credentials is
    # rejected by browsers and unsafe, so it is intentionally NOT included.
    # Add your production domain(s) via the CORS_ORIGINS env var.
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "https://finsight-backend-mnn6.onrender.com",
        "https://fin-sight-blush.vercel.app",
    ]
    CORS_CREDENTIALS: bool = True
    CORS_METHODS: List[str] = ["*"]
    CORS_HEADERS: List[str] = ["*"]

    # Email Configuration
    SMTP_SERVER: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SENDER_EMAIL: str = "noreply@finsight.io"
    SENDER_NAME: str = "FinSight Team"

    # API Keys
    YFINANCE_API_KEY: str = ""
    BINANCE_API_KEY: str = ""
    BINANCE_API_SECRET: str = ""
    NEWSAPI_KEY: str = ""
    HUGGINGFACE_API_KEY: str = ""

    # Machine Learning
    MODEL_PATH: str = "./models/trained/"
    DATA_PATH: str = "./data/"
    BATCH_SIZE: int = 32
    EPOCHS: int = 50
    LSTM_UNITS: int = 128
    LOOKBACK_WINDOW: int = 60
    TRAIN_TEST_SPLIT: float = 0.8

    # Cache
    CACHE_ENABLED: bool = True
    CACHE_TTL: int = 300
    REDIS_URL: str = "redis://localhost:6379/0"

    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FILE: str = "./logs/app.log"

    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_WINDOW: int = 60

    # Data Refresh Intervals
    MARKET_DATA_REFRESH_INTERVAL: int = 300
    NEWS_REFRESH_INTERVAL: int = 3600
    MODEL_RETRAIN_INTERVAL: int = 604800

    # Admin
    ADMIN_EMAIL: str = "admin@finsight.io"
    ADMIN_PASSWORD: str = "admin123"
    ADMIN_API_KEY: str = "admin-api-key"

    # Timezone
    TIMEZONE: str = "UTC"

    class Config:
        env_file = ".env"
        case_sensitive = True

    def get_database_url(self) -> str:
        """Get the database URL"""
        return self.DATABASE_URL

    def is_production(self) -> bool:
        """Check if running in production"""
        return self.ENVIRONMENT == "production"

    def is_development(self) -> bool:
        """Check if running in development"""
        return self.ENVIRONMENT == "development"

    def validate_security(self) -> None:
        """
        Fail fast on insecure config in production.

        In production, insecure placeholder secrets or a wildcard CORS origin
        raise RuntimeError so the app never boots with a forgeable JWT key or an
        open cross-origin policy. In development these only log a warning.
        """
        problems: list[str] = []

        for key, insecure_val in _INSECURE_DEFAULTS.items():
            if getattr(self, key, None) == insecure_val:
                problems.append(f"{key} is still the insecure default — set it via env/.env")

        # A dev/placeholder SECRET_KEY must never sign tokens in production.
        secret_lc = (self.SECRET_KEY or "").lower()
        if "dev" in secret_lc or "do-not-use" in secret_lc or "change" in secret_lc:
            problems.append("SECRET_KEY looks like a dev/placeholder value — generate one with `openssl rand -hex 32`")

        if self.DEBUG:
            problems.append("DEBUG must be False in production")

        if "*" in self.CORS_ORIGINS and self.CORS_CREDENTIALS:
            problems.append("CORS_ORIGINS contains '*' with credentials enabled — set explicit origins")

        if not problems:
            return

        if self.is_production():
            raise ValueError(
                "Insecure configuration blocked in production:\n  - "
                + "\n  - ".join(problems)
            )
        for p in problems:
            logger.warning("⚠ INSECURE CONFIG (dev only): %s", p)

# Create settings instance
settings = Settings()
settings.validate_security()

# Ensure required directories exist
os.makedirs(settings.MODEL_PATH, exist_ok=True)
os.makedirs(settings.DATA_PATH, exist_ok=True)
os.makedirs(os.path.dirname(settings.LOG_FILE), exist_ok=True)
