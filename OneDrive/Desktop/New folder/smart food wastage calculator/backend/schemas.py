from datetime import date as DateType, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


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


class FoodRecordFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

    year: int | None = None
    month: int | None = Field(default=None, ge=1, le=12)
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    day_name: str | None = None
    menu_name: str | None = None
    hostel_capacity: int | None = Field(default=None, gt=0)
    residents_present: int | None = Field(default=None, ge=0)
    advance_bookings: int | None = Field(default=None, ge=0)
    weekend_flag: int | None = Field(default=None, ge=0, le=1)
    exam_flag: int | None = Field(default=None, ge=0, le=1)
    vacation_flag: int | None = Field(default=None, ge=0, le=1)
    festival_flag: int | None = Field(default=None, ge=0, le=1)
    special_event_flag: int | None = Field(default=None, ge=0, le=1)
    temperature_c: float | None = None
    rain_index: float | None = Field(default=None, ge=0)
    menu_popularity_score: float | None = Field(default=None, ge=0)
    student_turnout: int | None = Field(default=None, ge=0)
    avg_consumed_per_student_kg: float | None = Field(default=None, ge=0)
    food_consumed_kg: float | None = Field(default=None, ge=0)
    food_prepared_kg: float | None = Field(default=None, ge=0)
    food_wasted_kg: float | None = Field(default=None, ge=0)
    waste_percentage: float | None = Field(default=None, ge=0)
    estimated_waste_cost_inr: float | None = Field(default=None, ge=0)


class FoodRecordCreate(FoodRecordFields):
    record_id: str | None = Field(default=None, min_length=1)
    date: DateType
    meal_category: str = Field(min_length=1)


class FoodRecordUpdate(FoodRecordFields):
    date: DateType | None = None
    meal_category: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def require_update_fields(self):
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided.")
        return self


class FoodRecordResponse(FoodRecordFields):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: int
    record_id: str | None = None
    date: DateType
    meal_category: str


class FoodRecordListResponse(BaseModel):
    records: list[FoodRecordResponse]
    total: int
    skip: int
    limit: int


class PredictionLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    meal_category: str
    predicted_waste_kg: float
    model_name: str | None
    created_at: datetime | None


class PredictionLogListResponse(BaseModel):
    records: list[PredictionLogResponse]
    total: int
    skip: int
    limit: int


class OptimizationLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    meal_category: str
    expected_demand_kg: float | None
    recommended_preparation_kg: float | None
    predicted_waste_kg: float | None
    estimated_shortage_kg: float | None
    estimated_penalty_cost: float | None
    created_at: datetime | None


class OptimizationLogListResponse(BaseModel):
    records: list[OptimizationLogResponse]
    total: int
    skip: int
    limit: int
