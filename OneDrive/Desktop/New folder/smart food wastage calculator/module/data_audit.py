import pandas as pd 
from pathlib import Path
import numpy as np

datapath=Path("C:\\Users\\udot\\OneDrive\\Desktop\\New folder\\smart food wastage calculator\\dataset\\hostel_food_waste.csv.xls")

df=pd.read_csv(datapath) 

print("shape:",df.shape)
print("columns:",df.dtypes)
df['date']=pd.to_datetime(df["date"], errors="coerce")

print("null values:",df.isnull().sum())

checks = {
    "waste greater than prepared":
        df["food_wasted_kg"] > df["food_prepared_kg"],
    "consumed greater than prepared":
        df["food_consumed_kg"] > df["food_prepared_kg"],
    "turnout greater than residents":
        df["student_turnout"] > df["residents_present"],
    "residents greater than capacity":
        df["residents_present"] > df["hostel_capacity"],
}
for name, condition in checks.items():
    print(f"{name}: {condition.sum()}")
    
df["balance_difference_kg"] = (
    df["food_prepared_kg"]
    - df["food_consumed_kg"]
    - df["food_wasted_kg"]
)
print(df["balance_difference_kg"].describe())
expected_percentage = (
    df["food_wasted_kg"] / df["food_prepared_kg"] * 100
)
print(expected_percentage.describe())
print(
    "Mean absolute waste-percentage difference:",
    (df["waste_percentage"] - expected_percentage).abs().mean()
)
print(df["food_wasted_kg"].describe())
print(
    df.groupby("meal_category")["food_wasted_kg"]
    .agg(["count", "mean", "median", "max"])
)
numeric = df.select_dtypes(include=np.number)
print(
    numeric.corr()["food_wasted_kg"]
    .sort_values(ascending=False)
)