from datetime import datetime, timezone
from contextlib import closing
from pathlib import Path
import sqlite3
import uuid

from backend.database.connection import DATABASE_DIR, ROOT_DIR

DATABASE_PATH = DATABASE_DIR / "food_waste.db"
BACKUP_DIR = DATABASE_DIR / "backups"
MAX_RESTORE_BYTES = 100 * 1024 * 1024
REQUIRED_TABLES = {
    "food_records",
    "predictions",
    "optimization_logs",
    "users",
    "blockchain_transactions",
    "sync_queue",
}
REQUIRED_COLUMNS = {
    "food_records": {"id", "date", "meal_category", "food_prepared_kg", "food_wasted_kg"},
    "predictions": {"id", "meal_category", "predicted_waste_kg", "created_at"},
    "optimization_logs": {"id", "meal_category", "recommended_preparation_kg", "created_at"},
    "users": {"id", "username", "role"},
    "blockchain_transactions": {"id", "record_type", "record_reference", "record_hash"},
    "sync_queue": {"id", "record_type", "record_reference", "payload", "status"},
}


def get_database_info() -> dict[str, object]:
    return {
        "database_path": str(DATABASE_PATH.resolve()),
        "backup_directory": str(BACKUP_DIR.resolve()),
        "database_exists": DATABASE_PATH.is_file(),
        "database_size_bytes": DATABASE_PATH.stat().st_size if DATABASE_PATH.is_file() else 0,
        "project_directory": str(ROOT_DIR.resolve()),
    }


def _new_backup_path(prefix: str = "food_waste") -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S_%fZ")
    return BACKUP_DIR / f"{prefix}_{timestamp}_{uuid.uuid4().hex[:8]}.db"


def validate_database_file(path: Path) -> None:
    if not path.is_file() or path.stat().st_size < 100:
        raise ValueError("The uploaded file is not a valid FoodWise SQLite database.")

    try:
        connection = sqlite3.connect(f"file:{path.resolve().as_posix()}?mode=ro", uri=True)
        try:
            integrity = connection.execute("PRAGMA quick_check").fetchone()
            if not integrity or integrity[0] != "ok":
                raise ValueError("SQLite integrity validation failed.")
            tables = {
                row[0]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                )
            }
            missing = REQUIRED_TABLES - tables
            if missing:
                raise ValueError(
                    "This database is missing required FoodWise tables: "
                    + ", ".join(sorted(missing))
                )
            for table, required_columns in REQUIRED_COLUMNS.items():
                columns = {
                    row[1]
                    for row in connection.execute(f"PRAGMA table_info({table})")
                }
                missing_columns = required_columns - columns
                if missing_columns:
                    raise ValueError(
                        f"The {table} table is missing required columns: "
                        + ", ".join(sorted(missing_columns))
                    )
        finally:
            connection.close()
    except sqlite3.DatabaseError as error:
        raise ValueError("The uploaded file is not a valid FoodWise SQLite database.") from error


def create_database_backup() -> Path:
    if not DATABASE_PATH.is_file():
        raise FileNotFoundError("The local FoodWise database does not exist yet.")

    validate_database_file(DATABASE_PATH)
    destination_path = _new_backup_path()
    try:
        with closing(sqlite3.connect(DATABASE_PATH, timeout=30)) as source:
            with closing(sqlite3.connect(destination_path, timeout=30)) as destination:
                source.backup(destination)
        validate_database_file(destination_path)
        return destination_path
    except Exception:
        destination_path.unlink(missing_ok=True)
        raise


def restore_database_backup(contents: bytes, confirm_overwrite: bool) -> dict[str, object]:
    if not confirm_overwrite:
        raise ValueError("Restore requires explicit overwrite confirmation.")
    if not contents:
        raise ValueError("The backup file is empty.")
    if len(contents) > MAX_RESTORE_BYTES:
        raise ValueError("The backup exceeds the 100 MB restore limit.")

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    staged_path = BACKUP_DIR / f"restore_{uuid.uuid4().hex}.db"
    try:
        staged_path.write_bytes(contents)
        validate_database_file(staged_path)
        safety_backup = create_database_backup()
        try:
            with closing(sqlite3.connect(staged_path, timeout=30)) as source:
                with closing(sqlite3.connect(DATABASE_PATH, timeout=30)) as destination:
                    source.backup(destination)
            validate_database_file(DATABASE_PATH)
        except Exception:
            with closing(sqlite3.connect(safety_backup, timeout=30)) as source:
                with closing(sqlite3.connect(DATABASE_PATH, timeout=30)) as destination:
                    source.backup(destination)
            raise
        return {
            "restored": True,
            "database_path": str(DATABASE_PATH.resolve()),
            "safety_backup_path": str(safety_backup.resolve()),
        }
    finally:
        staged_path.unlink(missing_ok=True)
