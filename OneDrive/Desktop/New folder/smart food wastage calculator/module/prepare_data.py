from pathlib import Path
import pandas as pd


BASE_DIR = Path(__file__).resolve().parent.parent

possible_paths = [
    BASE_DIR / "data" / "hostel_food_waste.csv",
    BASE_DIR / "dataset" / "hostel_food_waste.csv.xls",
    BASE_DIR / "dataset" / "hostel_food_waste.csv",
    BASE_DIR / "data" / "hostel_food_waste.csv.xls",
    Path("data/hostel_food_waste.csv"),
    Path("dataset/hostel_food_waste.csv.xls"),
    Path("dataset/hostel_food_waste.csv"),
]

DATA_PATH = next((p for p in possible_paths if p.exists()), None)
if DATA_PATH is None:
    raise FileNotFoundError(
        f"Could not find dataset file. Looked in: {[str(p) for p in possible_paths]}"
    )


OUTPUT_DIR = BASE_DIR / "data" / "processed"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


DATASET_PROCESSED_DIR = BASE_DIR / "dataset" / "processed"
DATASET_PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


DATA_CSV_COPY = BASE_DIR / "data" / "hostel_food_waste.csv"
DATA_CSV_COPY.parent.mkdir(parents=True, exist_ok=True)

df = pd.read_csv(DATA_PATH)


if not DATA_CSV_COPY.exists():
    df.to_csv(DATA_CSV_COPY, index=False)

required = [
    "date",
    "food_wasted_kg",
    "meal_category",
    "residents_present",
    "student_turnout",
    "hostel_capacity",
]

missing = [col for col in required if col not in df.columns]
if missing:
    raise ValueError(f"Missing required columns: {missing}")

df["date"] = pd.to_datetime(df["date"], errors="coerce")
df["food_wasted_kg"] = pd.to_numeric(
    df["food_wasted_kg"], errors="coerce"
)

df = df.dropna(subset=["date", "food_wasted_kg"])
df = df.sort_values("date").reset_index(drop=True)

df["day_of_week"] = df["date"].dt.dayofweek
df["month"] = df["date"].dt.month
df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)

feature_candidates = [
    "meal_category",
    "residents_present",
    "student_turnout",
    "hostel_capacity",
    "day_of_week",
    "month",
    "is_weekend",
]

features = [c for c in feature_candidates if c in df.columns]
target = "food_wasted_kg"

n = len(df)
train_end = int(n * 0.70)
val_end = int(n * 0.85)

train = df.iloc[:train_end].copy()
val = df.iloc[train_end:val_end].copy()
test = df.iloc[val_end:].copy()

train[features + [target]].to_csv(
    OUTPUT_DIR / "train.csv", index=False
)
val[features + [target]].to_csv(
    OUTPUT_DIR / "validation.csv", index=False
)
test[features + [target]].to_csv(
    OUTPUT_DIR / "test.csv", index=False
)

train[features + [target]].to_csv(
    DATASET_PROCESSED_DIR / "train.csv", index=False
)
val[features + [target]].to_csv(
    DATASET_PROCESSED_DIR / "validation.csv", index=False
)
test[features + [target]].to_csv(
    DATASET_PROCESSED_DIR / "test.csv", index=False
)

print("Selected features:", features)
print("Training records:", len(train))
print("Validation records:", len(val))
print("Test records:", len(test))

print("\nDate ranges:")
for name, part in [
    ("Train", train),
    ("Validation", val),
    ("Test", test),
]:
    print(name, part["date"].min(), "to", part["date"].max())

print("\nFiles saved in:", OUTPUT_DIR.resolve())
