import time
from typing import Tuple
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings
from app.core.logging import logger

# Database connection configuration
connect_args = {}
engine_kwargs = {
    "echo": False,
    "pool_pre_ping": True,  # Automatically detect disconnected/sleeping connections
}

if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
else:
    # Postgres pool recycling for serverless / managed cloud databases (Neon, Supabase)
    engine_kwargs["pool_recycle"] = 300

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    **engine_kwargs
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def check_db_connectivity() -> Tuple[bool, str]:
    """
    Safely tests database connectivity.
    Returns (True, 'connected') or (False, 'unreachable').
    Never exposes credentials, hosts, or sensitive exceptions.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, "connected"
    except Exception as e:
        logger.warning(f"Database health check failed: {type(e).__name__}")
        return False, "unreachable"

def init_db_with_retry(max_retries: int = 5, delay_seconds: float = 2.0) -> bool:
    """
    Attempts to verify database connectivity on startup with retries.
    Handles cold starts when managed Postgres (e.g. Neon or Supabase) is waking up from sleep.
    """
    for attempt in range(1, max_retries + 1):
        connected, _ = check_db_connectivity()
        if connected:
            logger.info(f"Database connection verified successfully on attempt {attempt}.")
            return True
        logger.warning(
            f"Database cold start: connection attempt {attempt}/{max_retries} failed. "
            f"Retrying in {delay_seconds}s..."
        )
        time.sleep(delay_seconds)
        delay_seconds *= 1.5

    logger.error(
        f"Database connection could not be established after {max_retries} startup attempts."
    )
    return False
