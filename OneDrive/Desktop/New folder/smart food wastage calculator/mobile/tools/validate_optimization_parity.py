from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
import onnxruntime as ort
import pandas as pd
from module.optimization import recommend_preparation


ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = ROOT / "models" / "food_waste_optimization.joblib"
DATA_PATH = ROOT / "data" / "hostel_food_waste.csv"
ONNX_PATH = Path(__file__).resolve().parents[1] / "assets" / "models" / "foodwise_optimization.onnx"
TOLERANCE = 1e-4

FEATURES = [
    "meal_category", "student_turnout", "residents_present", "hostel_capacity", "advance_bookings",
    "menu_popularity_score", "food_prepared_kg", "day_of_week", "month", "weekend_flag", "exam_flag",
    "vacation_flag", "festival_flag", "special_event_flag", "temperature_c", "rain_index",
]


def main() -> None:
    model = joblib.load(MODEL_PATH)
    session = ort.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])

    cases = [
        {
            "meal_category": "Lunch", "student_turnout": 140, "residents_present": 180,
            "hostel_capacity": 520, "advance_bookings": 145, "menu_popularity_score": 0.8,
            "expected_demand_kg": 75.0, "day_of_week": 2, "month": 10,
        },
        {
            "meal_category": "Dinner", "student_turnout": 260, "residents_present": 330,
            "hostel_capacity": 520, "advance_bookings": 240, "menu_popularity_score": 0.94,
            "expected_demand_kg": 135.0, "day_of_week": 5, "month": 12,
            "weekend_flag": 1, "exam_flag": 1, "temperature_c": 19.5, "rain_index": 0.12,
        },
    ]
    for input_data in cases:
        python_result = recommend_preparation(model=model, **input_data)
        candidates = np.arange(max(1.0, input_data["expected_demand_kg"] * 0.70), input_data["expected_demand_kg"] * 1.31, 0.5)
        rows = []
        defaults = {
            "weekend_flag": 0, "exam_flag": 0, "vacation_flag": 0, "festival_flag": 0,
            "special_event_flag": 0, "temperature_c": 25.0, "rain_index": 0.0,
        }
        for prepared_kg in candidates:
            row = {feature: input_data.get(feature, defaults.get(feature, 0)) for feature in FEATURES}
            row["food_prepared_kg"] = float(prepared_kg)
            rows.append(row)
        features = pd.DataFrame(rows, columns=FEATURES)
        feeds = {
            info.name: features[info.name].to_numpy(dtype=object if info.type == "tensor(string)" else np.float32).reshape(-1, 1)
            for info in session.get_inputs()
        }
        raw_predictions = np.asarray(session.run(None, feeds)[0]).reshape(-1)
        options = []
        for prepared, raw in zip(candidates, raw_predictions, strict=True):
            predicted_waste = min(max(0.0, float(raw)), float(prepared))
            shortage = max(0.0, input_data["expected_demand_kg"] - (prepared - predicted_waste))
            penalty = input_data.get("waste_cost_per_kg", 20.0) * predicted_waste + input_data.get("shortage_cost_per_kg", 100.0) * shortage
            options.append({
                "prepared_kg": round(float(prepared), 2),
                "predicted_waste_kg": round(predicted_waste, 2),
                "estimated_shortage_kg": round(shortage, 2),
                "estimated_penalty_cost": round(penalty, 2),
            })
        options.sort(key=lambda item: item["estimated_penalty_cost"])
        mobile_best = options[0]
        for key in ("prepared_kg", "predicted_waste_kg", "estimated_shortage_kg", "estimated_penalty_cost"):
            if abs(float(mobile_best[key]) - float(python_result.iloc[0][key])) > TOLERANCE:
                raise AssertionError(f"Optimizer parity failed for {key}: mobile={mobile_best[key]} Python={python_result.iloc[0][key]}")
        print(
            f"PASS {input_data['meal_category']} demand={input_data['expected_demand_kg']}kg "
            f"recommendation={mobile_best['prepared_kg']}kg "
            f"python={python_result.iloc[0]['prepared_kg']}kg"
        )


if __name__ == "__main__":
    main()
