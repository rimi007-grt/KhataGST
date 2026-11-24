import json
from datetime import datetime
from pathlib import Path
from sqlalchemy.orm import Session
from app.core.config import ROOT_DIR, BACKEND_DIR
from app.core.database import SessionLocal
from app.core.logging import logger
from app.models.rate_table import RateTable
from app.models.setting import SystemSetting
from app.models.deadline import Deadline

def seed_db(db: Session) -> None:
    """
    Populates rate_table and settings from /seed/*.json if empty.
    Mandatory: Keeps verified=false per DATA GROUNDING ADDENDUM.
    """
    seed_dir = ROOT_DIR / "seed"
    if not seed_dir.exists():
        seed_dir = BACKEND_DIR.parent / "seed"

    rate_seed_file = seed_dir / "rate_table_seed.json"
    if rate_seed_file.exists():
        with open(rate_seed_file, "r", encoding="utf-8") as f:
            rate_data = json.load(f)
            rates = rate_data.get("rates", [])
            for r in rates:
                existing = db.query(RateTable).filter(
                    RateTable.hsn_or_category == r["hsn_or_category"],
                    RateTable.rate == r["rate"]
                ).first()
                if existing:
                    existing.source_ref = r.get("source_ref", existing.source_ref)
                    existing.verified = r.get("verified", existing.verified)
                else:
                    eff_from = datetime.strptime(r["effective_from"], "%Y-%m-%d").date() if r.get("effective_from") else None
                    eff_to = datetime.strptime(r["effective_to"], "%Y-%m-%d").date() if r.get("effective_to") else None
                    new_rate = RateTable(
                        hsn_or_category=r["hsn_or_category"],
                        description=r.get("description"),
                        rate=r["rate"],
                        effective_from=eff_from,
                        effective_to=eff_to,
                        source_ref=r.get("source_ref", "PLACEHOLDER"),
                        verified=r.get("verified", False)
                    )
                    db.add(new_rate)
            db.commit()
            logger.info("Rate table seeded successfully from %s", rate_seed_file)

    settings_seed_file = seed_dir / "settings_seed.json"
    if settings_seed_file.exists():
        with open(settings_seed_file, "r", encoding="utf-8") as f:
            settings_data = json.load(f)
            settings_list = settings_data.get("settings", [])
            for s in settings_list:
                existing = db.query(SystemSetting).filter(SystemSetting.key == s["key"]).first()
                if not existing:
                    new_setting = SystemSetting(
                        key=s["key"],
                        value=s["value"],
                        source_ref=s.get("source_ref", "PLACEHOLDER"),
                        verified=s.get("verified", False)
                    )
                    db.add(new_setting)
            db.commit()
            logger.info("Settings seeded successfully from %s", settings_seed_file)

    deadlines_seed_file = seed_dir / "deadlines_seed.json"
    if deadlines_seed_file.exists():
        with open(deadlines_seed_file, "r", encoding="utf-8") as f:
            deadlines_data = json.load(f)
            deadlines_list = deadlines_data.get("deadlines", [])
            for d in deadlines_list:
                existing = db.query(Deadline).filter(
                    Deadline.return_type == d["return_type"],
                    Deadline.period == d.get("period")
                ).first()
                if existing:
                    existing.source_ref = d.get("source_ref", existing.source_ref)
                    existing.verified = d.get("verified", existing.verified)
                    if d.get("due_date"):
                        existing.due_date = datetime.strptime(d["due_date"], "%Y-%m-%d").date()
                else:
                    due = datetime.strptime(d["due_date"], "%Y-%m-%d").date() if d.get("due_date") else None
                    new_deadline = Deadline(
                        return_type=d["return_type"],
                        due_date=due,
                        period=d.get("period"),
                        scheme=d.get("scheme"),
                        source_ref=d.get("source_ref", "PLACEHOLDER"),
                        verified=d.get("verified", False)
                    )
                    db.add(new_deadline)
            db.commit()
            logger.info("Deadlines seeded successfully from %s", deadlines_seed_file)

if __name__ == "__main__":
    db = SessionLocal()
    try:
        seed_db(db)
    finally:
        db.close()

