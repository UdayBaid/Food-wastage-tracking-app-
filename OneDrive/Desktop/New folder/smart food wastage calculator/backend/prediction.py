from pathlib import Path

import joblib
import pandas as pd


ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "models" / "food_waste_baseline.joblib"

if not MODEL_PATH.exists():
    raise FileNotFoundError(f"Model not found: {MODEL_PATH}")

model = joblib.load(MODEL_PATH)


def predict_waste(data):
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

    return {
        "predicted_waste_kg": round(max(0.0, prediction), 2),
        "unit": "kg",
    }
