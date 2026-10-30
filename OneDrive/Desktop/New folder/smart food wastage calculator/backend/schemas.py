from pydantic import BaseModel, Field


class WastePredictionRequest(BaseModel):
    meal_category: str = Field(min_length=1)
    residents_present: int = Field(ge=0)
    student_turnout: int = Field(ge=0)
    hostel_capacity: int = Field(gt=0)
    day_of_week: int = Field(ge=0, le=6)
    month: int = Field(ge=1, le=12)
    is_weekend: int = Field(ge=0, le=1)


class WastePredictionResponse(BaseModel):
    predicted_waste_kg: float
    unit: str = "kg"


class OptimizationRequest(BaseModel):
    meal_category: str = Field(min_length=1)

    student_turnout: int = Field(ge=0)
    residents_present: int = Field(ge=0)
    hostel_capacity: int = Field(gt=0)

    advance_bookings: int = Field(ge=0)
    menu_popularity_score: float = Field(ge=0)

    expected_demand_kg: float = Field(gt=0)

    day_of_week: int = Field(ge=0, le=6)
    month: int = Field(ge=1, le=12)

    weekend_flag: int = Field(ge=0, le=1)
    exam_flag: int = Field(ge=0, le=1)
    vacation_flag: int = Field(ge=0, le=1)
    festival_flag: int = Field(ge=0, le=1)
    special_event_flag: int = Field(ge=0, le=1)

    temperature_c: float = 25.0
    rain_index: float = Field(default=0.0, ge=0)

    waste_cost_per_kg: float = Field(default=20.0, ge=0)
    shortage_cost_per_kg: float = Field(default=100.0, ge=0)
