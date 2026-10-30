from pathlib import Path

import joblib
import pandas as pd
from sqlalchemy.orm import Session

from backend.database.models import Prediction

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "models" / "food_waste_baseline.joblib"

if not MODEL_PATH.exists():
    raise FileNotFoundError(f"Model not found: {MODEL_PATH}")

model = joblib.load(MODEL_PATH)


def predict_waste(data, db: Session | None = None):
    features = pd.DataFrame([{
        "meal_category": data.meal_category.strip(),
        "residents_present": data.residents_present,
        "student_turnout": data.student_turnout,
        "hostel_capacity": data.hostel_capacity,
        "day_of_week": data.day_of_week,
        "month": data.month,
        "is_weekend": data.is_weekend,
    }])

    prediction = float(model.predict(features)[0])
    predicted_waste = round(max(0.0, prediction), 2)

    if db is not None:
        db.add(Prediction(
            meal_category=data.meal_category.strip(),
            predicted_waste_kg=predicted_waste,
            model_name=MODEL_PATH.name,
        ))
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise

    return {
        "predicted_waste_kg": predicted_waste,
        "unit": "kg",
    }
