
from sqlalchemy.orm import Session
from backend.database.models import FoodRecord, OptimizationLog, Prediction


def get_all_records(db: Session, skip: int = 0, limit: int = 100):
    """Fetch food records with pagination."""
    return (
        db.query(FoodRecord)
        .order_by(FoodRecord.date.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_record_by_id(db: Session, record_id: int):
    """Fetch a record using its database ID."""
    return db.query(FoodRecord).filter(
        FoodRecord.id == record_id
    ).first()


def get_record_by_record_id(db: Session, record_id: str):
    """Fetch a record using its original dataset record_id."""
    return db.query(FoodRecord).filter(
        FoodRecord.record_id == record_id
    ).first()


def create_record(db: Session, record_data: dict):
    """Insert a new food record."""
    record = FoodRecord(**record_data)

    db.add(record)
    try:
        db.commit()
        db.refresh(record)
    except Exception:
        db.rollback()
        raise

    return record


def update_record(db: Session, record_id: int, update_data: dict):
    """Update an existing food record."""
    record = get_record_by_id(db, record_id)

    if not record:
        return None

    for key, value in update_data.items():
        if hasattr(record, key) and key not in ("id", "record_id"):
            setattr(record, key, value)

    try:
        db.commit()
        db.refresh(record)
    except Exception:
        db.rollback()
        raise

    return record


def delete_record(db: Session, record_id: int):
    """Delete a food record."""
    record = get_record_by_id(db, record_id)

    if not record:
        return False

    db.delete(record)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return True


def get_total_records(db: Session):
    """Return total number of food records."""
    return db.query(FoodRecord).count()


def get_predictions(db: Session, skip: int = 0, limit: int = 100):
    """Fetch prediction logs newest first with pagination."""
    return (
        db.query(Prediction)
        .order_by(Prediction.created_at.desc(), Prediction.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_total_predictions(db: Session):
    return db.query(Prediction).count()


def get_optimization_logs(db: Session, skip: int = 0, limit: int = 100):
    """Fetch optimization logs newest first with pagination."""
    return (
        db.query(OptimizationLog)
        .order_by(OptimizationLog.created_at.desc(), OptimizationLog.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_total_optimization_logs(db: Session):
    return db.query(OptimizationLog).count()
