from __future__ import annotations

import copy
import json
from pathlib import Path

import joblib
import numpy as np
import onnx
import onnxruntime as ort
import pandas as pd
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType, StringTensorType


MOBILE_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = MOBILE_ROOT.parent
OUTPUT_DIRECTORY = MOBILE_ROOT / "assets" / "models"
ABSOLUTE_TOLERANCE = 1e-4

MODEL_CASES = {
    "baseline": {
        "artifact": "food_waste_baseline.joblib",
        "sample": REPOSITORY_ROOT / "data" / "processed" / "test.csv",
        "categorical_transformer": "categorical",
    },
    "optimization": {
        "artifact": "food_waste_optimization.joblib",
        "sample": REPOSITORY_ROOT / "data" / "hostel_food_waste.csv",
        "categorical_transformer": "categorical",
    },
    "semi_supervised": {
        "artifact": "food_waste_semi_supervised.joblib",
        "sample": REPOSITORY_ROOT / "data" / "processed" / "test.csv",
        "categorical_transformer": "cat",
    },
}


def make_feeds(session: ort.InferenceSession, frame: pd.DataFrame) -> dict[str, np.ndarray]:
    feeds = {}
    for input_info in session.get_inputs():
        dtype = object if input_info.type == "tensor(string)" else np.float32
        feeds[input_info.name] = frame[input_info.name].to_numpy(dtype=dtype).reshape(-1, 1)
    return feeds


def convert_case(name: str, config: dict[str, str]) -> dict[str, object]:
    artifact_path = REPOSITORY_ROOT / "models" / config["artifact"]
    if not artifact_path.is_file():
        raise FileNotFoundError(f"Model artifact not found: {artifact_path}")

    original_model = joblib.load(artifact_path)
    features = list(original_model.feature_names_in_)
    sample_frame = pd.read_csv(config["sample"])
    sample_frame = sample_frame[features].dropna(subset=["meal_category"])
    if name == "optimization":
        sample_frame = sample_frame.sample(n=min(128, len(sample_frame)), random_state=42)
    else:
        sample_frame = sample_frame.head(128)
    if sample_frame.empty:
        raise ValueError(f"No validation rows available for {name}.")

    expected = np.asarray(original_model.predict(sample_frame), dtype=np.float64).reshape(-1)
    export_model = copy.deepcopy(original_model)
    preprocessor = export_model.named_steps[export_model.steps[0][0]]
    categorical_pipeline = preprocessor.named_transformers_[config["categorical_transformer"]]
    categorical_pipeline.named_steps["imputer"].missing_values = ""

    initial_types = [
        (
            feature,
            StringTensorType([None, 1])
            if feature == "meal_category"
            else FloatTensorType([None, 1]),
        )
        for feature in features
    ]
    converted = convert_sklearn(
        export_model,
        initial_types=initial_types,
        target_opset=17,
    )
    onnx.checker.check_model(converted)

    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIRECTORY / f"foodwise_{name}.onnx"
    output_path.write_bytes(converted.SerializeToString())

    session = ort.InferenceSession(str(output_path), providers=["CPUExecutionProvider"])
    actual = np.asarray(session.run(None, make_feeds(session, sample_frame))[0]).reshape(-1)
    max_error = float(np.max(np.abs(actual - expected)))
    if not np.allclose(actual, expected, rtol=0.0, atol=ABSOLUTE_TOLERANCE):
        output_path.unlink(missing_ok=True)
        raise AssertionError(
            f"{name} ONNX parity failed: max_abs_error={max_error:.8g}, "
            f"tolerance={ABSOLUTE_TOLERANCE}"
        )

    return {
        "file": output_path.name,
        "bytes": output_path.stat().st_size,
        "features": features,
        "rows_validated": len(sample_frame),
        "max_abs_error": max_error,
        "absolute_tolerance": ABSOLUTE_TOLERANCE,
        "target_opset": 17,
        "meal_category_required": True,
    }


def main() -> None:
    manifest = {
        "format": "ONNX",
        "runtime": "onnxruntime-react-native",
        "source": "Existing FoodWise sklearn pipelines; no retraining",
        "models": {},
    }
    for name, config in MODEL_CASES.items():
        result = convert_case(name, config)
        manifest["models"][name] = result
        print(
            f"{name}: PASS rows={result['rows_validated']} "
            f"max_abs_error={result['max_abs_error']:.8g} "
            f"bytes={result['bytes']}"
        )

    manifest_path = OUTPUT_DIRECTORY / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
