
from fastapi import FastAPI, HTTPException

from backend.prediction import predict_waste
from backend.optimization_service import optimize_preparation

from backend.schemas import (
    WastePredictionRequest,
    WastePredictionResponse,
    OptimizationRequest,
)
from backend.analytics_services import (
    get_analytics_summary,
    get_waste_trends,
    get_meal_wise_analytics,
)

app = FastAPI(
    title="Smart Food Waste Tracking API",
    description="ML-based food waste prediction and preparation optimization.",
    version="1.1.0",
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


@app.post("/predict", response_model=WastePredictionResponse)
def predict(request: WastePredictionRequest):
    try:
        return predict_waste(request)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@app.post("/optimize")
def optimize(request: OptimizationRequest):
    try:
        return optimize_preparation(request)
    except FileNotFoundError as error:
        raise HTTPException(status_code=503, detail=str(error))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))

@app.get("/analytics/summary")
def analytics_summary():
    try:
        return get_analytics_summary()
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@app.get("/analytics/trends")
def analytics_trends(period: str = "daily"):
    try:
        return get_waste_trends(period)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


@app.get("/analytics/meal-wise")
def analytics_meal_wise():
    try:
        return get_meal_wise_analytics()
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
