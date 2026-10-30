
from typing import cast
from backend.database.connection import SessionLocal
from backend.database import crud


def test_crud():
    db = SessionLocal()

    try:
        
        total = crud.get_total_records(db)
        print("Total records:", total)

        records = crud.get_all_records(db, limit=5)
        print("\nFirst 5 records:")

        for record in records:
            print(
                record.id,
                record.record_id,
                record.meal_category,
                record.food_wasted_kg
            )

       
        if records:
            record = crud.get_record_by_id(db, cast(int, records[0].id))
            if record is not None:
                print("\nRecord found:", record.record_id)

    finally:
        db.close()


if __name__ == "__main__":
    test_crud()
