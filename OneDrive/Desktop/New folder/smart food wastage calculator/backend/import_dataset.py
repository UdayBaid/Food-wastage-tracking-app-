from pathlib import Path

import pandas as pd

from backend.database.connection import SessionLocal
from backend.database.models import FoodRecord
from backend.database.init_db import init_db


ROOT_DIR = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT_DIR / "data" / "hostel_food_waste.csv"


def import_food_records():
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"Dataset not found: {CSV_PATH}")

    init_db()

    df = pd.read_csv(CSV_PATH)
    df["date"] = pd.to_datetime(df["date"]).dt.date

    db = SessionLocal()

    try:
        existing_ids = {
            row[0]
            for row in db.query(FoodRecord.record_id).all()
        }

        records = []

        for _, row in df.iterrows():
            record_id = str(row["record_id"])

            if record_id in existing_ids:
                continue

            record = FoodRecord(
                **{
                    column: (
                        str(row[column])
                        if column == "record_id"
                        else row[column]
                    )
                    for column in df.columns
                }
            )

            records.append(record)

        db.add_all(records)
        db.commit()

        total_records = db.query(FoodRecord).count()

        print("CSV import completed successfully.")
        print(f"New records imported: {len(records)}")
        print(f"Total database records: {total_records}")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    import_food_records()