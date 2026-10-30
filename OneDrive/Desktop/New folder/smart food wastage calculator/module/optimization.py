
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sklearn.metrics import mean_absolute_error


ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "hostel_food_waste.csv"
MODEL_PATH = ROOT / "models" / "food_waste_optimization.joblib"

TARGET = "food_wasted_kg"

FEATURES = [
    "meal_category",
    "student_turnout",
    "residents_present",
    "hostel_capacity",
    "advance_bookings",
    "menu_popularity_score",
    "food_prepared_kg",
    "day_of_week",
    "month",
    "weekend_flag",
    "exam_flag",
    "vacation_flag",
    "festival_flag",
    "special_event_flag",
    "temperature_c",
    "rain_index",
]

CAT = ["meal_category"]
NUM = [c for c in FEATURES if c not in CAT]


def build_model():
    preprocessing = ColumnTransformer([
        ("numeric", SimpleImputer(strategy="median"), NUM),
        ("categorical", Pipeline([
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore")),
        ]), CAT),
    ])

    return Pipeline([
        ("preprocessing", preprocessing),
        ("model", RandomForestRegressor(
            n_estimators=300,
            min_samples_leaf=3,
            random_state=42,
            n_jobs=-1,
        )),
    ])


def train_optimization_model():
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Dataset not found: {DATA_PATH}")

    df = pd.read_csv(DATA_PATH)

    required = FEATURES + [TARGET, "date"]
    missing = [col for col in required if col not in df.columns]

    if missing:
        raise ValueError(f"Missing dataset columns: {missing}")

    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df[TARGET] = pd.to_numeric(df[TARGET], errors="coerce")

    df = (
        df.dropna(subset=["date", TARGET])
        .sort_values("date")
        .reset_index(drop=True)
    )

    split = int(len(df) * 0.80)

    train = df.iloc[:split]
    holdout = df.iloc[split:]

    if train.empty or holdout.empty:
        raise ValueError("Not enough records for chronological training.")

    model = build_model()
    model.fit(train[FEATURES], train[TARGET])

    predictions = model.predict(holdout[FEATURES])
    mae = mean_absolute_error(holdout[TARGET], predictions)

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_PATH)

    print("Optimization model trained successfully.")
    print("Training records:", len(train))
    print("Holdout records:", len(holdout))
    print("Holdout MAE:", round(float(mae), 4), "kg")
    print("Model saved:", MODEL_PATH)

    return model


def load_optimization_model():
    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            "Optimization model not found. "
            "Run: python -m module.optimization"
        )

    return joblib.load(MODEL_PATH)


def recommend_preparation(
    model,
    meal_category,
    student_turnout,
    residents_present,
    hostel_capacity,
    advance_bookings,
    menu_popularity_score,
    expected_demand_kg,
    day_of_week,
    month,
    weekend_flag=0,
    exam_flag=0,
    vacation_flag=0,
    festival_flag=0,
    special_event_flag=0,
    temperature_c=25.0,
    rain_index=0.0,
    waste_cost_per_kg=20.0,
    shortage_cost_per_kg=100.0,
):
    if expected_demand_kg <= 0:
        raise ValueError("Expected demand must be greater than zero.")

    candidates = np.arange(
        max(1.0, expected_demand_kg * 0.70),
        expected_demand_kg * 1.31,
        0.5,
    )

    options = []

    for prepared_kg in candidates:
        row = pd.DataFrame([{
            "meal_category": meal_category,
            "student_turnout": student_turnout,
            "residents_present": residents_present,
            "hostel_capacity": hostel_capacity,
            "advance_bookings": advance_bookings,
            "menu_popularity_score": menu_popularity_score,
            "food_prepared_kg": prepared_kg,
            "day_of_week": day_of_week,
            "month": month,
            "weekend_flag": weekend_flag,
            "exam_flag": exam_flag,
            "vacation_flag": vacation_flag,
            "festival_flag": festival_flag,
            "special_event_flag": special_event_flag,
            "temperature_c": temperature_c,
            "rain_index": rain_index,
        }], columns=FEATURES)

        predicted_waste = max(0.0, float(model.predict(row)[0]))
        predicted_waste = min(predicted_waste, prepared_kg)

        usable_food = prepared_kg - predicted_waste
        shortage = max(0.0, expected_demand_kg - usable_food)

        total_cost = (
            waste_cost_per_kg * predicted_waste
            + shortage_cost_per_kg * shortage
        )

        options.append({
            "prepared_kg": round(float(prepared_kg), 2),
            "predicted_waste_kg": round(predicted_waste, 2),
            "estimated_shortage_kg": round(shortage, 2),
            "estimated_penalty_cost": round(float(total_cost), 2),
        })

    results = pd.DataFrame(options)
    results = results.sort_values("estimated_penalty_cost")

    return results.reset_index(drop=True)


if __name__ == "__main__":
    train_optimization_model()
