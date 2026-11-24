import os
import sys
from pathlib import Path

# Add backend directory to sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from alembic.config import Config
from alembic import command
from app.core.config import settings
from app.core.database import SessionLocal, init_db_with_retry
from app.core.logging import logger
from app.seed_data import seed_db

def run_migrations():
    """
    Executes Alembic migrations to head and seeds initial statutory data.
    Designed to be run as an explicit step during deployment or CI.
    """
    logger.info("Initializing database connection with retry...")
    if not init_db_with_retry(max_retries=5, delay_seconds=2.0):
        logger.error("Failed to connect to database for migrations.")
        sys.exit(1)

    alembic_ini_path = BACKEND_DIR / "alembic.ini"
    alembic_cfg = Config(str(alembic_ini_path))
    alembic_cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))

    logger.info("Running Alembic migrations on target database...")
    try:
        command.upgrade(alembic_cfg, "head")
        logger.info("Alembic schema migrations applied successfully (head).")
    except Exception as e:
        logger.error(f"Alembic migration failed: {e}")
        sys.exit(1)

    # Seed baseline statutory tables
    try:
        db = SessionLocal()
        seed_db(db)
        db.close()
        logger.info("Default statutory seed data populated successfully.")
    except Exception as e:
        logger.warning(f"Seed step encountered notice: {e}")

    logger.info("Database migration and initialization complete.")

if __name__ == "__main__":
    run_migrations()

