# FoodWise Android Migration Plan

## Scope and Preservation

- Create a self-contained Expo/React Native TypeScript project in `mobile/`.
- Do not move, overwrite, or delete the Vite website, FastAPI project, SQLite database, datasets, or trained `.joblib` models.
- Keep the existing FastAPI service optional. The Android app must perform record CRUD, analytics, prediction, and preparation optimization from local storage/inference when offline.
- Reuse the current API contracts for synchronization rather than introducing an internet-dependent mobile workflow.

## Existing System Inspected

- FastAPI schemas: `backend/schemas.py` defines food record, prediction, and optimization request shapes.
- Persistence: `backend/database/models.py` has `food_records`, `predictions`, `optimization_logs`, `users`, `blockchain_transactions`, and `sync_queue`; backend SQLite defaults to `database/food_waste.db` and supports `FOODWISE_DATA_DIR`.
- API: `backend/main.py` exposes records CRUD, local health, prediction, optimization, analytics, history, and backup/restore routes.
- Prediction pipeline: `food_waste_baseline.joblib`, 7 ordered inputs (`meal_category`, `residents_present`, `student_turnout`, `hostel_capacity`, `day_of_week`, `month`, `is_weekend`), `ColumnTransformer` preprocessing, and 300-tree `RandomForestRegressor`.
- Optimization pipeline: `food_waste_optimization.joblib`, 16 ordered inputs, `ColumnTransformer` preprocessing, and 300-tree `RandomForestRegressor`. The objective scans preparation candidates at 0.5 kg increments, limits predicted waste to food prepared, and minimizes configured waste plus shortage cost.
- Semi-supervised model: `food_waste_semi_supervised.joblib` is a separate 7-input, 300-tree pipeline. No existing inference API uses it; mobile will not substitute it for the production baseline.
- Frontend screens inspected: dashboard, meal entry, reports/edit/delete/export, recommendations, alerts, sustainability, and about/local data tools. The design uses cream, beige, terracotta `#C95740`, muted green, and mustard.
- Model artifact sizes are approximately 18.2 MB baseline, 13.3 MB optimization, and 15.5 MB semi-supervised. `skl2onnx`, `onnx`, and `onnxruntime` are not currently installed.

## Proposed Mobile Architecture

```text
mobile/
  app/                 Expo entry, navigation, app config
  src/
    db/                 Expo SQLite schema, versioned migrations, repository
    features/           dashboard, records, reports, recommendations, alerts, sustainability, about
    navigation/         React Navigation tabs/stacks
    services/           API client, sync queue, connectivity/diagnostics
    ml/                 ONNX session and feature mapping; no silent server fallback
    theme/              FoodWise colors, type, spacing, controls
    components/         reusable native cards, forms, charts, status banners
  assets/models/        only validated ONNX exports and model metadata
```

- Use Expo SDK's compatible package versions and React Navigation 7.
- SQLite is the source of truth on-device. Version schema with `PRAGMA user_version`; preserve current record field meanings, add UUID client IDs, server IDs, timestamps, and sync state only in mobile-local tables.
- Create/update/delete operations commit locally first. Queue server actions and use stable UUID record IDs for retry idempotency. Do not silently overwrite a remote edit when the existing API cannot prove which version is newer; surface conflicts for resolution.
- Compute dashboard, reports, charts, alerts, and sustainability from local SQLite. Analytics must remain available when FastAPI is stopped.
- Use ONNX Runtime React Native in a custom Expo development/native build, not Expo Go, if the existing pipelines convert and pass parity tests. Preserve feature order, imputers, one-hot categories, forest parameters, and output rounding. Keep candidate-cost optimization logic identical in TypeScript and validate it against Python outputs.
- Store sensitive connection configuration in Expo SecureStore; normal default local API URL is configuration, not a credential. Do not add cloud auth or external AI calls.
- Expo Camera provides capture only. Classification/detection remains unavailable until a validated local vision model is supplied. Do not fabricate scale or blockchain integrations.

## Validation Gates

1. Install/type-check/lint/build the separate mobile package without changing existing app packages.
2. Test versioned SQLite migrations, CRUD, restart persistence, local reports, and export/backup against temporary test data.
3. Convert each model used by the app and compare ONNX Runtime outputs against Python joblib outputs over fixed examples from real feature distributions. A failed conversion/parity gate blocks shipping local inference; do not train or replace models.
4. Test offline sync queue retries and conflict behavior against a temporary FastAPI `FOODWISE_DATA_DIR`.
5. Produce Android development/APK/AAB artifacts only with a configured Android SDK or authenticated EAS Build environment.
6. Perform install, offline, restart, camera permission, and inference tests on an actual Android device. Emulator/browser results do not satisfy this gate.

## Environment Findings

- Node.js and npm are installed; current registry metadata reports Expo 58 and compatible Expo module versions.
- `adb`, `ANDROID_HOME`, and `ANDROID_SDK_ROOT` are absent in the current environment. No physical Android device is attached through ADB.
- ONNX conversion/runtime packages are absent from the selected Python interpreter. They must be installed in an isolated conversion environment before model conversion is claimed.
- Until the Android device and physical offline gates pass, the Android application and Phase 5 are not production-complete.
