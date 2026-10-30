
from pathlib import Path
import json

import joblib
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "processed"
MODEL_DIR = ROOT / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

TARGET = "food_wasted_kg"

FEATURES = [
    "meal_category",
    "residents_present",
    "student_turnout",
    "hostel_capacity",
    "day_of_week",
    "month",
    "is_weekend",
]

train = pd.read_csv(DATA_DIR / "train.csv")
validation = pd.read_csv(DATA_DIR / "validation.csv")
test = pd.read_csv(DATA_DIR / "test.csv")

for name, df in [
    ("train", train),
    ("validation", validation),
    ("test", test),
]:
    missing = set(FEATURES + [TARGET]) - set(df.columns)
    if missing:
        raise ValueError(f"{name}.csv is missing columns: {sorted(missing)}")

    df.dropna(subset=[TARGET], inplace=True)

X_train = train[FEATURES]
y_train = train[TARGET]

X_val = validation[FEATURES]
y_val = validation[TARGET]

X_test = test[FEATURES]
y_test = test[TARGET]

categorical_features = ["meal_category"]
numeric_features = [
    "residents_present",
    "student_turnout",
    "hostel_capacity",
    "day_of_week",
    "month",
    "is_weekend",
]

numeric_pipeline = Pipeline([
    ("imputer", SimpleImputer(strategy="median")),
])

categorical_pipeline = Pipeline([
    ("imputer", SimpleImputer(strategy="most_frequent")),
    ("encoder", OneHotEncoder(handle_unknown="ignore")),
])

preprocessor = ColumnTransformer([
    ("numeric", numeric_pipeline, numeric_features),
    ("categorical", categorical_pipeline, categorical_features),
])

model = Pipeline([
    ("preprocessor", preprocessor),
    ("regressor", RandomForestRegressor(
        n_estimators=300,
        max_depth=None,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1,
    )),
])

model.fit(X_train, y_train)

def evaluate(y_true, predictions):
    return {
        "MAE": round(float(mean_absolute_error(y_true, predictions)), 4),
        "RMSE": round(float(mean_squared_error(y_true, predictions) ** 0.5), 4),
        "R2": round(float(r2_score(y_true, predictions)), 4),
    }

val_predictions = model.predict(X_val)
val_metrics = evaluate(y_val, val_predictions)

print("\nValidation metrics:")
print(json.dumps(val_metrics, indent=2))


test_predictions = model.predict(X_test)
test_metrics = evaluate(y_test, test_predictions)

print("\nTest metrics:")
print(json.dumps(test_metrics, indent=2))

joblib.dump(model, MODEL_DIR / "food_waste_baseline.joblib")

with open(MODEL_DIR / "baseline_metrics.json", "w") as f:
    json.dump(
        {"validation": val_metrics, "test": test_metrics},
        f,
        indent=2,
    )

print("\nModel saved to models/food_waste_baseline.joblib")
print("Metrics saved to models/baseline_metrics.json")
