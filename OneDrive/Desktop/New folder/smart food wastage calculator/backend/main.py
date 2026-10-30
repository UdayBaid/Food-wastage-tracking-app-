
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Path as PathParam, Query, Request, status
from fastapi.responses import FileResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from backend.prediction import predict_waste
from backend.optimization_service import optimize_preparation
from backend.database import crud
from backend.database.connection import get_db
from backend.database.init_db import init_db
from backend.database.connection import DATABASE_URL, engine
from backend.database.backup_service import (
    MAX_RESTORE_BYTES,
    create_database_backup,
    get_database_info,
    restore_database_backup,
)

from backend.schemas import (
    WastePredictionRequest,
    WastePredictionResponse,
    OptimizationRequest,
    FoodRecordCreate,
    FoodRecordListResponse,
    FoodRecordResponse,
    FoodRecordUpdate,
    PredictionLogListResponse,
    OptimizationLogListResponse,
)
from backend.analytics_services import (
    get_analytics_summary,
    get_waste_trends,
    get_meal_wise_analytics,
)
from backend.prediction import MODEL_PATH as PREDICTION_MODEL_PATH
from module.optimization import MODEL_PATH as OPTIMIZATION_MODEL_PATH

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Smart Food Waste Tracking API",
    description="ML-based food waste prediction and preparation optimization.",
    version="1.1.0",
    lifespan=lifespan,
)


@app.get("/")
def home():
    return {
        "message": "Smart Food Waste Tracking API is running",
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": True,
    }


@app.get("/health/local")
def local_health():
    database_available = False
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("SELECT 1")
        database_available = True
    except SQLAlchemyError:
        logger.exception("Local SQLite health check failed")

    prediction_model_loaded = PREDICTION_MODEL_PATH.is_file()
    optimization_model_available = OPTIMIZATION_MODEL_PATH.is_file()
    return {
        "status": "ok" if database_available and prediction_model_loaded else "degraded",
        "database_available": database_available,
        "database_url": DATABASE_URL,
        "database_path": str(get_database_info()["database_path"]),
        "prediction_model_loaded": prediction_model_loaded,
        "optimization_model_available": optimization_model_available,
        "internet_required": False,
    }


@app.post("/predict", response_model=WastePredictionResponse)
def predict(request: WastePredictionRequest, db: Session = Depends(get_db)):
    try:
        return predict_waste(request, db=db)
    except SQLAlchemyError as error:
        logger.exception("Could not save prediction result")
        raise HTTPException(status_code=503, detail="Database unavailable") from error
    except Exception as error:
        logger.exception("Prediction request failed")
        raise HTTPException(status_code=500, detail="Prediction failed") from error


@app.post("/optimize")
def optimize(request: OptimizationRequest, db: Session = Depends(get_db)):
    try:
        return optimize_preparation(request, db=db)
    except FileNotFoundError as error:
        raise HTTPException(status_code=503, detail=str(error))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except SQLAlchemyError as error:
        logger.exception("Could not save optimization result")
        raise HTTPException(status_code=503, detail="Database unavailable") from error
    except Exception as error:
        logger.exception("Optimization request failed")
        raise HTTPException(status_code=500, detail="Optimization failed") from error


@app.get("/predictions", response_model=PredictionLogListResponse)
def list_predictions(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    try:
        return {
            "records": crud.get_predictions(db, skip=skip, limit=limit),
            "total": crud.get_total_predictions(db),
            "skip": skip,
            "limit": limit,
        }
    except SQLAlchemyError as error:
        logger.exception("Could not list prediction logs")
        raise HTTPException(status_code=503, detail="Database unavailable") from error


@app.get("/optimization-logs", response_model=OptimizationLogListResponse)
def list_optimization_logs(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    try:
        return {
            "records": crud.get_optimization_logs(db, skip=skip, limit=limit),
            "total": crud.get_total_optimization_logs(db),
            "skip": skip,
            "limit": limit,
        }
    except SQLAlchemyError as error:
        logger.exception("Could not list optimization logs")
        raise HTTPException(status_code=503, detail="Database unavailable") from error


@app.get("/database/info")
def database_info():
    return get_database_info()


@app.get("/database/backup")
def download_database_backup():
    try:
        backup_path = create_database_backup()
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except (OSError, SQLAlchemyError, ValueError) as error:
        logger.exception("Could not create database backup")
        raise HTTPException(status_code=503, detail="Database backup failed") from error
    return FileResponse(
        backup_path,
        media_type="application/vnd.sqlite3",
        filename=backup_path.name,
    )


@app.post("/database/restore")
async def restore_database(
    request: Request,
    confirm_overwrite: bool = Query(default=False),
):
    chunks = []
    total_bytes = 0
    async for chunk in request.stream():
        total_bytes += len(chunk)
        if total_bytes > MAX_RESTORE_BYTES:
            raise HTTPException(status_code=413, detail="The backup exceeds the 100 MB restore limit.")
        chunks.append(chunk)
    contents = b"".join(chunks)
    try:
        return restore_database_backup(contents, confirm_overwrite)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except (OSError, SQLAlchemyError) as error:
        logger.exception("Could not restore database backup")
        raise HTTPException(status_code=503, detail="Database restore failed") from error


@app.post(
    "/records",
    response_model=FoodRecordResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_food_record(
    data: FoodRecordCreate,
    db: Session = Depends(get_db),
):
    try:
        return crud.create_record(db, data.model_dump())
    except IntegrityError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A food record with this record_id already exists.",
        ) from error
    except SQLAlchemyError as error:
        logger.exception("Could not create food record")
        raise HTTPException(status_code=503, detail="Database unavailable") from error


@app.get("/records", response_model=FoodRecordListResponse)
def list_food_records(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    try:
        return {
            "records": crud.get_all_records(db, skip=skip, limit=limit),
            "total": crud.get_total_records(db),
            "skip": skip,
            "limit": limit,
        }
    except SQLAlchemyError as error:
        logger.exception("Could not list food records")
        raise HTTPException(status_code=503, detail="Database unavailable") from error


@app.get("/records/{record_id}", response_model=FoodRecordResponse)
def read_food_record(
    record_id: int = PathParam(ge=1),
    db: Session = Depends(get_db),
):
    try:
        record = crud.get_record_by_id(db, record_id)
    except SQLAlchemyError as error:
        logger.exception("Could not read food record")
        raise HTTPException(status_code=503, detail="Database unavailable") from error
    if record is None:
        raise HTTPException(status_code=404, detail="Food record not found")
    return record


@app.put("/records/{record_id}", response_model=FoodRecordResponse)
@app.patch("/records/{record_id}", response_model=FoodRecordResponse)
def update_food_record(
    data: FoodRecordUpdate,
    record_id: int = PathParam(ge=1),
    db: Session = Depends(get_db),
):
    try:
        record = crud.update_record(
            db,
            record_id,
            data.model_dump(exclude_unset=True, exclude_none=True),
        )
    except IntegrityError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Food record conflicts with an existing record.",
        ) from error
    except SQLAlchemyError as error:
        logger.exception("Could not update food record")
        raise HTTPException(status_code=503, detail="Database unavailable") from error
    if record is None:
        raise HTTPException(status_code=404, detail="Food record not found")
    return record


@app.delete("/records/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_food_record(
    record_id: int = PathParam(ge=1),
    db: Session = Depends(get_db),
):
    try:
        deleted = crud.delete_record(db, record_id)
    except SQLAlchemyError as error:
        logger.exception("Could not delete food record")
        raise HTTPException(status_code=503, detail="Database unavailable") from error
    if not deleted:
        raise HTTPException(status_code=404, detail="Food record not found")

@app.get("/analytics/summary")
def analytics_summary(db: Session = Depends(get_db)):
    try:
        return get_analytics_summary(db)
    except SQLAlchemyError as error:
        logger.exception("Could not calculate analytics summary")
        raise HTTPException(status_code=503, detail="Database unavailable") from error
    except Exception as error:
        logger.exception("Analytics summary failed")
        raise HTTPException(status_code=500, detail="Analytics request failed") from error


@app.get("/analytics/trends")
def analytics_trends(
    period: str = Query(default="daily"),
    db: Session = Depends(get_db),
):
    try:
        return get_waste_trends(db, period)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except SQLAlchemyError as error:
        logger.exception("Could not calculate waste trends")
        raise HTTPException(status_code=503, detail="Database unavailable") from error
    except Exception as error:
        logger.exception("Waste trends request failed")
        raise HTTPException(status_code=500, detail="Analytics request failed") from error


@app.get("/analytics/meal-wise")
def analytics_meal_wise(db: Session = Depends(get_db)):
    try:
        return get_meal_wise_analytics(db)
    except SQLAlchemyError as error:
        logger.exception("Could not calculate meal-wise analytics")
        raise HTTPException(status_code=503, detail="Database unavailable") from error
    except Exception as error:
        logger.exception("Meal-wise analytics request failed")
        raise HTTPException(status_code=500, detail="Analytics request failed") from error
