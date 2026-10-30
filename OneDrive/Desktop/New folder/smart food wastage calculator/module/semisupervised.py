
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from sklearn.base import clone
from sklearn.ensemble import RandomForestRegressor
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


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

CAT = ["meal_category"]
NUM = [c for c in FEATURES if c not in CAT]

train = pd.read_csv(DATA_DIR / "train.csv").dropna(subset=[TARGET])
val = pd.read_csv(DATA_DIR / "validation.csv").dropna(subset=[TARGET])
test = pd.read_csv(DATA_DIR / "test.csv").dropna(subset=[TARGET])

def make_model():
    preprocessor = ColumnTransformer([
        ("num", SimpleImputer(strategy="median"), NUM),
        ("cat", Pipeline([
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore")),
        ]), CAT),
    ])

    return Pipeline([
        ("prep", preprocessor),
        ("rf", RandomForestRegressor(
            n_estimators=300,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1,
        )),
    ])

def metrics(y, pred):
    return {
        "MAE": round(float(mean_absolute_error(y, pred)), 4),
        "RMSE": round(float(np.sqrt(mean_squared_error(y, pred))), 4),
        "R2": round(float(r2_score(y, pred)), 4),
    }


rng = np.random.default_rng(42)
X_all = train[FEATURES].reset_index(drop=True)
y_all = train[TARGET].reset_index(drop=True)

indices = rng.permutation(len(train))
labelled_count = max(1, int(0.70 * len(train)))
labelled_idx = indices[:labelled_count]
unlabelled_idx = indices[labelled_count:]

X_labelled = X_all.iloc[labelled_idx]
y_labelled = y_all.iloc[labelled_idx]
X_unlabelled = X_all.iloc[unlabelled_idx]


initial_model = make_model()
initial_model.fit(X_labelled, y_labelled)


pseudo = initial_model.predict(X_unlabelled)

rf = initial_model.named_steps["rf"]
X_unlabelled_transformed = initial_model.named_steps["prep"].transform(
    X_unlabelled
)
tree_predictions = np.vstack([
    tree.predict(X_unlabelled_transformed)
    for tree in rf.estimators_
])

prediction_std = tree_predictions.std(axis=0)


if len(pseudo):
    threshold = np.quantile(prediction_std, 0.50)
    keep = prediction_std <= threshold
else:
    keep = np.array([], dtype=bool)

X_pseudo = X_unlabelled.iloc[np.flatnonzero(keep)]
y_pseudo = pseudo[keep]


X_combined = pd.concat(
    [X_labelled, X_pseudo],
    ignore_index=True,
)
y_combined = pd.concat(
    [y_labelled, pd.Series(y_pseudo)],
    ignore_index=True,
)

semi_model = make_model()
semi_model.fit(X_combined, y_combined)


baseline_pred = initial_model.predict(val[FEATURES])
semi_pred = semi_model.predict(val[FEATURES])

print("Initial supervised model:")
print(metrics(val[TARGET], baseline_pred))

print("\nSemi-supervised model:")
print(metrics(val[TARGET], semi_pred))

print(f"\nOriginal training records: {len(train)}")
print(f"Labelled records used: {len(labelled_idx)}")
print(f"Hidden-label records: {len(unlabelled_idx)}")
print(f"Accepted pseudo-labels: {len(y_pseudo)}")


joblib.dump(semi_model, MODEL_DIR / "food_waste_semi_supervised.joblib")


test_pred = semi_model.predict(test[FEATURES])
print("\nSemi-supervised test metrics:")
print(metrics(test[TARGET], test_pred))
