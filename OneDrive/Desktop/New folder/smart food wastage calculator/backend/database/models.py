from datetime import date, datetime

from sqlalchemy import (
    Integer,
    String,
    Float,
    Date,
    DateTime,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from backend.database.connection import Base


class FoodRecord(Base):
    __tablename__ = "food_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    record_id: Mapped[str | None] = mapped_column(String, unique=True, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    year: Mapped[int | None] = mapped_column(Integer)
    month: Mapped[int | None] = mapped_column(Integer)
    day_of_week: Mapped[int | None] = mapped_column(Integer)
    day_name: Mapped[str | None] = mapped_column(String)
    meal_category: Mapped[str] = mapped_column(String, nullable=False, index=True)
    menu_name: Mapped[str | None] = mapped_column(String)
    hostel_capacity: Mapped[int | None] = mapped_column(Integer)
    residents_present: Mapped[int | None] = mapped_column(Integer)
    advance_bookings: Mapped[int | None] = mapped_column(Integer)
    weekend_flag: Mapped[int | None] = mapped_column(Integer)
    exam_flag: Mapped[int | None] = mapped_column(Integer)
    vacation_flag: Mapped[int | None] = mapped_column(Integer)
    festival_flag: Mapped[int | None] = mapped_column(Integer)
    special_event_flag: Mapped[int | None] = mapped_column(Integer)
    temperature_c: Mapped[float | None] = mapped_column(Float)
    rain_index: Mapped[float | None] = mapped_column(Float)
    menu_popularity_score: Mapped[float | None] = mapped_column(Float)
    student_turnout: Mapped[int | None] = mapped_column(Integer)
    avg_consumed_per_student_kg: Mapped[float | None] = mapped_column(Float)
    food_consumed_kg: Mapped[float | None] = mapped_column(Float)
    food_prepared_kg: Mapped[float | None] = mapped_column(Float)
    food_wasted_kg: Mapped[float | None] = mapped_column(Float)
    waste_percentage: Mapped[float | None] = mapped_column(Float)
    estimated_waste_cost_inr: Mapped[float | None] = mapped_column(Float)


class Prediction(Base):
    __tablename__ = "predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    meal_category: Mapped[str] = mapped_column(String, nullable=False)
    predicted_waste_kg: Mapped[float] = mapped_column(Float, nullable=False)
    model_name: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now()
    )


class OptimizationLog(Base):
    __tablename__ = "optimization_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    meal_category: Mapped[str] = mapped_column(String, nullable=False)
    expected_demand_kg: Mapped[float | None] = mapped_column(Float)
    recommended_preparation_kg: Mapped[float | None] = mapped_column(Float)
    predicted_waste_kg: Mapped[float | None] = mapped_column(Float)
    estimated_shortage_kg: Mapped[float | None] = mapped_column(Float)
    estimated_penalty_cost: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now()
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    role: Mapped[str | None] = mapped_column(String, default="operator")
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now()
    )


class BlockchainTransaction(Base):
    __tablename__ = "blockchain_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    record_type: Mapped[str] = mapped_column(String, nullable=False)
    record_reference: Mapped[str] = mapped_column(String, nullable=False)
    record_hash: Mapped[str] = mapped_column(String, nullable=False, index=True)
    transaction_id: Mapped[str | None] = mapped_column(String)
    status: Mapped[str | None] = mapped_column(String, default="pending")
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now()
    )


class SyncQueue(Base):
    __tablename__ = "sync_queue"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    record_type: Mapped[str] = mapped_column(String, nullable=False)
    record_reference: Mapped[str] = mapped_column(String, nullable=False)
    payload: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str | None] = mapped_column(String, default="pending")
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now()
    )