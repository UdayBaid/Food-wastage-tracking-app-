
from functools import lru_cache

from module.optimization import (
    load_optimization_model,
    recommend_preparation,
)


@lru_cache(maxsize=1)
def get_optimization_model():
    return load_optimization_model()


def optimize_preparation(data):
    model = get_optimization_model()

    results = recommend_preparation(
        model=model,
        meal_category=data.meal_category,
        student_turnout=data.student_turnout,
        residents_present=data.residents_present,
        hostel_capacity=data.hostel_capacity,
        advance_bookings=data.advance_bookings,
        menu_popularity_score=data.menu_popularity_score,
        expected_demand_kg=data.expected_demand_kg,
        day_of_week=data.day_of_week,
        month=data.month,
        weekend_flag=data.weekend_flag,
        exam_flag=data.exam_flag,
        vacation_flag=data.vacation_flag,
        festival_flag=data.festival_flag,
        special_event_flag=data.special_event_flag,
        temperature_c=data.temperature_c,
        rain_index=data.rain_index,
        waste_cost_per_kg=data.waste_cost_per_kg,
        shortage_cost_per_kg=data.shortage_cost_per_kg,
    )

    best = results.iloc[0].to_dict()

    return {
        "recommended_preparation_kg": best["prepared_kg"],
        "predicted_waste_kg": best["predicted_waste_kg"],
        "estimated_shortage_kg": best["estimated_shortage_kg"],
        "estimated_penalty_cost": best["estimated_penalty_cost"],
        "top_options": results.head(5).to_dict(orient="records"),
    }
