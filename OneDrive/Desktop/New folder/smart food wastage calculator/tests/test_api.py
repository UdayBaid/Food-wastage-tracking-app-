import unittest
import sqlite3
import tempfile
from contextlib import closing
from datetime import date
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database.connection import Base, get_db
from backend.database.models import FoodRecord, OptimizationLog, Prediction
from backend.main import app


class FixedModel:
    def __init__(self, value: float):
        self.value = value

    def predict(self, features):
        return [self.value] * len(features)


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.session_factory = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=self.engine,
        )

        def override_get_db():
            db = self.session_factory()
            try:
                yield db
            finally:
                db.close()

        self.previous_overrides = app.dependency_overrides.copy()
        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        app.dependency_overrides.update(self.previous_overrides)
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def create_record(self, **overrides):
        payload = {
            "record_id": "record-1",
            "date": "2025-01-01",
            "meal_category": "Breakfast",
            "hostel_capacity": 100,
            "residents_present": 80,
            "student_turnout": 70,
            "food_prepared_kg": 10,
            "food_consumed_kg": 8,
            "food_wasted_kg": 2,
            "estimated_waste_cost_inr": 20,
        }
        payload.update(overrides)
        return self.client.post("/records", json=payload)

    def test_root_and_health_endpoints(self):
        self.assertEqual(self.client.get("/").json(), {
            "message": "Smart Food Waste Tracking API is running",
            "docs": "/docs",
        })
        self.assertEqual(self.client.get("/health").json(), {
            "status": "ok",
            "model_loaded": True,
        })

    def test_local_health_reports_offline_components(self):
        response = self.client.get("/health/local")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["database_available"], True)
        self.assertTrue(response.json()["prediction_model_loaded"])
        self.assertTrue(response.json()["optimization_model_available"])
        self.assertFalse(response.json()["internet_required"])

    def test_food_record_crud_endpoints(self):
        created = self.create_record()
        self.assertEqual(created.status_code, 201, created.text)
        record = created.json()
        record_id = record["id"]
        self.assertEqual(record["record_id"], "record-1")

        listing = self.client.get("/records?skip=0&limit=5")
        self.assertEqual(listing.status_code, 200, listing.text)
        self.assertEqual(listing.json()["total"], 1)
        self.assertEqual(len(listing.json()["records"]), 1)

        fetched = self.client.get(f"/records/{record_id}")
        self.assertEqual(fetched.status_code, 200, fetched.text)
        self.assertEqual(fetched.json()["meal_category"], "Breakfast")

        replaced = self.client.put(
            f"/records/{record_id}",
            json={"meal_category": "Brunch"},
        )
        self.assertEqual(replaced.status_code, 200, replaced.text)
        self.assertEqual(replaced.json()["meal_category"], "Brunch")

        patched = self.client.patch(
            f"/records/{record_id}",
            json={"food_wasted_kg": 1.5},
        )
        self.assertEqual(patched.status_code, 200, patched.text)
        self.assertEqual(patched.json()["food_wasted_kg"], 1.5)

        deleted = self.client.delete(f"/records/{record_id}")
        self.assertEqual(deleted.status_code, 204)
        self.assertEqual(self.client.get(f"/records/{record_id}").status_code, 404)

    def test_food_record_conflicts_and_validation(self):
        self.assertEqual(self.create_record().status_code, 201)
        duplicate = self.create_record(record_id="record-1")
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(self.client.get("/records?limit=0").status_code, 422)
        self.assertEqual(
            self.client.patch("/records/1", json={}).status_code,
            422,
        )
        self.assertEqual(self.client.get("/records/999").status_code, 404)
        self.assertEqual(self.client.delete("/records/999").status_code, 404)

    def test_prediction_endpoint_and_persistence(self):
        request = {
            "meal_category": "Breakfast",
            "residents_present": 80,
            "student_turnout": 70,
            "hostel_capacity": 100,
            "day_of_week": 2,
            "month": 1,
            "is_weekend": 0,
        }
        with patch("backend.prediction.model", FixedModel(4.567)):
            response = self.client.post("/predict", json=request)

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {
            "predicted_waste_kg": 4.57,
            "unit": "kg",
        })
        with self.session_factory() as db:
            prediction = db.query(Prediction).one()
            self.assertEqual(prediction.meal_category, "Breakfast")
            self.assertEqual(prediction.predicted_waste_kg, 4.57)
            self.assertTrue(prediction.model_name)

        prediction_logs = self.client.get("/predictions?limit=10")
        self.assertEqual(prediction_logs.status_code, 200, prediction_logs.text)
        self.assertEqual(prediction_logs.json()["total"], 1)
        self.assertEqual(
            prediction_logs.json()["records"][0]["meal_category"],
            "Breakfast",
        )
        self.assertEqual(self.client.get("/predictions?limit=0").status_code, 422)

        self.assertEqual(self.client.post("/predict", json={}).status_code, 422)

    def test_optimization_endpoint_and_persistence(self):
        request = {
            "meal_category": "Lunch",
            "student_turnout": 70,
            "residents_present": 80,
            "hostel_capacity": 100,
            "advance_bookings": 60,
            "menu_popularity_score": 0.8,
            "expected_demand_kg": 50,
            "day_of_week": 2,
            "month": 1,
            "weekend_flag": 0,
            "exam_flag": 0,
            "vacation_flag": 0,
            "festival_flag": 0,
            "special_event_flag": 0,
        }
        with patch(
            "backend.optimization_service.get_optimization_model",
            return_value=FixedModel(2),
        ):
            response = self.client.post("/optimize", json=request)

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(set(body), {
            "recommended_preparation_kg",
            "predicted_waste_kg",
            "estimated_shortage_kg",
            "estimated_penalty_cost",
            "top_options",
        })
        self.assertTrue(body["top_options"])
        with self.session_factory() as db:
            log = db.query(OptimizationLog).one()
            self.assertEqual(log.meal_category, "Lunch")
            self.assertEqual(log.expected_demand_kg, 50)

        optimization_logs = self.client.get("/optimization-logs?limit=10")
        self.assertEqual(optimization_logs.status_code, 200, optimization_logs.text)
        self.assertEqual(optimization_logs.json()["total"], 1)
        self.assertEqual(
            optimization_logs.json()["records"][0]["meal_category"],
            "Lunch",
        )
        self.assertEqual(
            self.client.get("/optimization-logs?limit=0").status_code,
            422,
        )

        self.assertEqual(self.client.post("/optimize", json={}).status_code, 422)

        request["expected_demand_kg"] = 0.1
        with patch(
            "backend.optimization_service.get_optimization_model",
            return_value=FixedModel(0.1),
        ):
            small_demand = self.client.post("/optimize", json=request)
        self.assertEqual(small_demand.status_code, 200, small_demand.text)
        self.assertTrue(small_demand.json()["top_options"])

    def test_optimization_reports_missing_local_model(self):
        request = {
            "meal_category": "Lunch",
            "student_turnout": 70,
            "residents_present": 80,
            "hostel_capacity": 100,
            "advance_bookings": 60,
            "menu_popularity_score": 0.8,
            "expected_demand_kg": 50,
            "day_of_week": 2,
            "month": 1,
            "weekend_flag": 0,
            "exam_flag": 0,
            "vacation_flag": 0,
            "festival_flag": 0,
            "special_event_flag": 0,
        }
        with patch(
            "backend.optimization_service.get_optimization_model",
            side_effect=FileNotFoundError("local model missing"),
        ):
            response = self.client.post("/optimize", json=request)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "local model missing")

    def test_analytics_endpoints_read_sqlite(self):
        self.create_record()
        self.create_record(
            record_id="record-2",
            date="2025-01-01",
            meal_category="Dinner",
            food_prepared_kg=5,
            food_consumed_kg=4,
            food_wasted_kg=1,
            estimated_waste_cost_inr=10,
        )
        self.create_record(
            record_id="record-3",
            date="2025-02-01",
            meal_category="Lunch",
            food_prepared_kg=8,
            food_consumed_kg=6,
            food_wasted_kg=2,
            estimated_waste_cost_inr=40,
        )

        summary = self.client.get("/analytics/summary")
        self.assertEqual(summary.status_code, 200, summary.text)
        self.assertEqual(summary.json(), {
            "total_records": 3,
            "total_prepared_kg": 23.0,
            "total_consumed_kg": 18.0,
            "total_wasted_kg": 5.0,
            "overall_waste_percentage": 21.74,
            "estimated_waste_cost_inr": 70.0,
        })

        daily = self.client.get("/analytics/trends?period=daily")
        monthly = self.client.get("/analytics/trends?period=monthly")
        self.assertEqual(daily.status_code, 200, daily.text)
        self.assertEqual(monthly.status_code, 200, monthly.text)
        self.assertEqual(daily.json()["total_periods"], 2)
        self.assertEqual(monthly.json()["total_periods"], 2)
        self.assertEqual(
            self.client.get("/analytics/trends?period=yearly").status_code,
            400,
        )

        meals = self.client.get("/analytics/meal-wise")
        self.assertEqual(meals.status_code, 200, meals.text)
        self.assertEqual(meals.json()["highest_waste_meal"], "Breakfast")
        self.assertEqual(len(meals.json()["meal_categories"]), 3)

    def test_database_info_backup_and_safe_restore(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            database_path = temp_root / "food_waste.db"
            backup_dir = temp_root / "backups"
            file_engine = create_engine(f"sqlite:///{database_path}")
            Base.metadata.create_all(bind=file_engine)
            file_sessions = sessionmaker(bind=file_engine)
            with file_sessions() as db:
                db.add(FoodRecord(
                    record_id="backup-record-1",
                    date=date(2025, 1, 1),
                    meal_category="Breakfast",
                    food_prepared_kg=10,
                    food_consumed_kg=8,
                    food_wasted_kg=2,
                    estimated_waste_cost_inr=20,
                ))
                db.commit()
            file_engine.dispose()

            with (
                patch("backend.database.backup_service.DATABASE_PATH", database_path),
                patch("backend.database.backup_service.BACKUP_DIR", backup_dir),
            ):
                info = self.client.get("/database/info")
                self.assertEqual(info.status_code, 200, info.text)
                self.assertEqual(info.json()["database_path"], str(database_path.resolve()))

                backup_response = self.client.get("/database/backup")
                self.assertEqual(backup_response.status_code, 200, backup_response.text)
                self.assertIn("attachment;", backup_response.headers["content-disposition"])
                backup_bytes = backup_response.content

                with closing(sqlite3.connect(database_path)) as db:
                    db.execute(
                        "INSERT INTO food_records "
                        "(record_id, date, meal_category) VALUES (?, ?, ?)",
                        ("backup-record-2", "2025-01-02", "Lunch"),
                    )
                    db.commit()
                self.assertEqual(self._file_record_count(database_path), 2)

                no_confirm = self.client.post(
                    "/database/restore",
                    params={"confirm_overwrite": "false"},
                    content=backup_bytes,
                    headers={"Content-Type": "application/vnd.sqlite3"},
                )
                self.assertEqual(no_confirm.status_code, 400)
                self.assertEqual(self._file_record_count(database_path), 2)

                invalid = self.client.post(
                    "/database/restore",
                    params={"confirm_overwrite": "true"},
                    content=b"not a sqlite database",
                    headers={"Content-Type": "application/vnd.sqlite3"},
                )
                self.assertEqual(invalid.status_code, 400)
                self.assertEqual(self._file_record_count(database_path), 2)

                restored = self.client.post(
                    "/database/restore",
                    params={"confirm_overwrite": "true"},
                    content=backup_bytes,
                    headers={"Content-Type": "application/vnd.sqlite3"},
                )
                self.assertEqual(restored.status_code, 200, restored.text)
                self.assertEqual(self._file_record_count(database_path), 1)
                safety_backup = Path(restored.json()["safety_backup_path"])
                self.assertTrue(safety_backup.is_file())
                self.assertEqual(self._file_record_count(safety_backup), 2)

                oversized = self.client.post(
                    "/database/restore?confirm_overwrite=true",
                    content=b"x" * (100 * 1024 * 1024 + 1),
                    headers={"Content-Type": "application/vnd.sqlite3"},
                )
                self.assertEqual(oversized.status_code, 413)
                self.assertEqual(self._file_record_count(database_path), 1)

    @staticmethod
    def _file_record_count(database_path):
        with closing(sqlite3.connect(database_path)) as db:
            return db.execute("SELECT COUNT(*) FROM food_records").fetchone()[0]


if __name__ == "__main__":
    unittest.main()