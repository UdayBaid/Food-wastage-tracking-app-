
from collections import defaultdict
from typing import cast

from sqlalchemy.orm import Session

from backend.database.models import FoodRecord


def _number(value: object) -> float:
    return float(cast(float, value))


def _load_analytics_records(db: Session) -> list[FoodRecord]:
    return (
        db.query(FoodRecord)
        .filter(
            FoodRecord.date.is_not(None),
            FoodRecord.food_prepared_kg.is_not(None),
            FoodRecord.food_consumed_kg.is_not(None),
            FoodRecord.food_wasted_kg.is_not(None),
            FoodRecord.estimated_waste_cost_inr.is_not(None),
        )
        .all()
    )


def get_analytics_summary(db: Session):
    records = _load_analytics_records(db)

    total_prepared = sum(_number(record.food_prepared_kg) for record in records)
    total_consumed = sum(_number(record.food_consumed_kg) for record in records)
    total_wasted = sum(_number(record.food_wasted_kg) for record in records)
    total_cost = sum(_number(record.estimated_waste_cost_inr) for record in records)

    waste_percentage = (
        (total_wasted / total_prepared) * 100
        if total_prepared > 0 else 0
    )

    return {
        "total_records": len(records),
        "total_prepared_kg": round(total_prepared, 2),
        "total_consumed_kg": round(total_consumed, 2),
        "total_wasted_kg": round(total_wasted, 2),
        "overall_waste_percentage": round(waste_percentage, 2),
        "estimated_waste_cost_inr": round(total_cost, 2),
    }


def get_waste_trends(db: Session, period: str = "daily"):
    if period not in ("daily", "monthly"):
        raise ValueError("Period must be 'daily' or 'monthly'.")

    grouped = defaultdict(lambda: {
        "prepared_kg": 0.0,
        "consumed_kg": 0.0,
        "wasted_kg": 0.0,
        "estimated_cost_inr": 0.0,
    })

    for record in _load_analytics_records(db):
        period_key = record.date.strftime(
            "%Y-%m-%d" if period == "daily" else "%Y-%m"
        )
        totals = grouped[period_key]
        totals["prepared_kg"] += _number(record.food_prepared_kg)
        totals["consumed_kg"] += _number(record.food_consumed_kg)
        totals["wasted_kg"] += _number(record.food_wasted_kg)
        totals["estimated_cost_inr"] += _number(record.estimated_waste_cost_inr)

    trends = []
    for period_key in sorted(grouped):
        totals = grouped[period_key]
        prepared = totals["prepared_kg"]
        trends.append({
            "period": period_key,
            "prepared_kg": round(prepared, 2),
            "consumed_kg": round(totals["consumed_kg"], 2),
            "wasted_kg": round(totals["wasted_kg"], 2),
            "estimated_cost_inr": round(totals["estimated_cost_inr"], 2),
            "waste_percentage": round(
                totals["wasted_kg"] / prepared * 100 if prepared else 0,
                2,
            ),
        })

    return {
        "period": period,
        "total_periods": int(len(trends)),
        "trends": trends,
    }


def get_meal_wise_analytics(db: Session):
    grouped = defaultdict(lambda: {
        "records": 0,
        "prepared_kg": 0.0,
        "consumed_kg": 0.0,
        "wasted_kg": 0.0,
        "estimated_cost_inr": 0.0,
    })

    for record in _load_analytics_records(db):
        if record.meal_category is None:
            continue
        totals = grouped[record.meal_category]
        totals["records"] += 1
        totals["prepared_kg"] += _number(record.food_prepared_kg)
        totals["consumed_kg"] += _number(record.food_consumed_kg)
        totals["wasted_kg"] += _number(record.food_wasted_kg)
        totals["estimated_cost_inr"] += _number(record.estimated_waste_cost_inr)

    meal_data = []
    for meal_category, totals in grouped.items():
        prepared = totals["prepared_kg"]
        meal_data.append({
            "meal_category": meal_category,
            "records": totals["records"],
            "prepared_kg": round(prepared, 2),
            "consumed_kg": round(totals["consumed_kg"], 2),
            "wasted_kg": round(totals["wasted_kg"], 2),
            "estimated_cost_inr": round(totals["estimated_cost_inr"], 2),
            "waste_percentage": round(
                totals["wasted_kg"] / prepared * 100 if prepared else 0,
                2,
            ),
        })

    meal_data.sort(key=lambda item: item["wasted_kg"], reverse=True)

    return {
        "meal_categories": meal_data,
        "highest_waste_meal": (
            meal_data[0]["meal_category"] if meal_data else None
        ),
    }
