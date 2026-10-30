
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "hostel_food_waste.csv"


def load_data():
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Dataset not found: {DATA_PATH}")

    df = pd.read_csv(DATA_PATH)

    required_columns = [
        "date",
        "meal_category",
        "food_prepared_kg",
        "food_consumed_kg",
        "food_wasted_kg",
        "estimated_waste_cost_inr",
    ]

    missing = [
        col for col in required_columns
        if col not in df.columns
    ]

    if missing:
        raise ValueError(f"Missing columns: {missing}")

    df["date"] = pd.to_datetime(df["date"], errors="coerce")

    numeric_columns = [
        "food_prepared_kg",
        "food_consumed_kg",
        "food_wasted_kg",
        "estimated_waste_cost_inr",
    ]

    for col in numeric_columns:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna(subset=["date"] + numeric_columns)

    return df


def get_analytics_summary():
    df = load_data()

    total_prepared = float(df["food_prepared_kg"].sum())
    total_consumed = float(df["food_consumed_kg"].sum())
    total_wasted = float(df["food_wasted_kg"].sum())
    total_cost = float(df["estimated_waste_cost_inr"].sum())

    waste_percentage = (
        (total_wasted / total_prepared) * 100
        if total_prepared > 0 else 0
    )

    return {
        "total_records": int(len(df)),
        "total_prepared_kg": round(total_prepared, 2),
        "total_consumed_kg": round(total_consumed, 2),
        "total_wasted_kg": round(total_wasted, 2),
        "overall_waste_percentage": round(waste_percentage, 2),
        "estimated_waste_cost_inr": round(total_cost, 2),
    }


def get_waste_trends(period="daily"):
    df = load_data()

    if period == "daily":
        df["period"] = df["date"].dt.strftime("%Y-%m-%d")

    elif period == "monthly":
        df["period"] = df["date"].dt.strftime("%Y-%m")

    else:
        raise ValueError("Period must be 'daily' or 'monthly'.")

    trends = (
        df.groupby("period", as_index=False)
        .agg(
            prepared_kg=("food_prepared_kg", "sum"),
            consumed_kg=("food_consumed_kg", "sum"),
            wasted_kg=("food_wasted_kg", "sum"),
            estimated_cost_inr=("estimated_waste_cost_inr", "sum"),
        )
        .sort_values("period")
    )

    trends["waste_percentage"] = (
        trends["wasted_kg"] / trends["prepared_kg"].replace(0, pd.NA)
    ) * 100

    trends = trends.fillna(0).round(2)

    return {
        "period": period,
        "total_periods": int(len(trends)),
        "trends": trends.to_dict(orient="records"),
    }


def get_meal_wise_analytics():
    df = load_data()

    meal_data = (
        df.groupby("meal_category", as_index=False)
        .agg(
            records=("food_wasted_kg", "count"),
            prepared_kg=("food_prepared_kg", "sum"),
            consumed_kg=("food_consumed_kg", "sum"),
            wasted_kg=("food_wasted_kg", "sum"),
            estimated_cost_inr=("estimated_waste_cost_inr", "sum"),
        )
    )

    meal_data["waste_percentage"] = (
        meal_data["wasted_kg"]
        / meal_data["prepared_kg"].replace(0, pd.NA)
    ) * 100

    meal_data = meal_data.fillna(0).round(2)

    meal_data = meal_data.sort_values(
        "wasted_kg",
        ascending=False,
    )

    return {
        "meal_categories": meal_data.to_dict(orient="records"),
        "highest_waste_meal": (
            str(meal_data.iloc[0]["meal_category"])
            if not meal_data.empty else None
        ),
    }
