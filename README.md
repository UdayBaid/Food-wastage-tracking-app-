# FoodWise Android

Native Expo/React Native TypeScript application alongside the existing Vite site and FastAPI backend. The mobile app uses local SQLite for records and history, on-device ONNX Runtime for the existing prediction/optimization models, and FastAPI only as an optional local-network sync server.

## Project Structure

- `src/db/`: versioned Expo SQLite schema, migrations, CRUD, local analytics, history, backup/restore.
- `src/services/localModels.ts`: ONNX Runtime sessions; no server inference fallback.
- `src/services/sync.ts`: queued record synchronization, duplicate recovery, server snapshot conflict detection.
- `src/navigation.tsx`, `src/screens.tsx`: native navigation and Dashboard, Records, Reports, AI Plan, Alerts, Sustainability, About, Camera.
- `assets/models/`: ONNX exports generated from, and parity-checked against, the existing joblib pipelines.
- `tools/export_models_onnx.py`: reproducible copy-only conversion and output parity gate.

The local mobile database is an app-private file named `foodwise-mobile.db`, versioned with SQLite `user_version`. The existing repository database is not opened by the mobile app.

## Setup

Requirements: Node.js/npm, an Expo account, and network access. The existing native Android project is retained in `android/`.

```powershell
Set-Location mobile
npm install
npx expo install --check
npm run typecheck
```

## Cloud Android Builds

The `preview` EAS profile produces an installable internal-distribution APK. The project includes `onnxruntime-react-native` as an Expo config plugin and Android Gradle dependency; EAS installs and compiles this native module in the cloud. The ONNX models remain bundled with the app for offline inference.

```powershell
npx eas-cli login
npx eas-cli init
npx eas-cli build --platform android --profile preview
```

Run `eas init` once to link this app to an Expo EAS project; it adds the required EAS project ID to the Expo config. Download the APK from the completed EAS build page and install it on the phone.

The `development` profile also creates an APK, but it is a development client intended for use with Metro. The `production` profile creates an AAB for Play Store distribution.

The local `android:apk` and `android:aab` scripts remain available, but are not used for cloud builds. Do not use `expo run:android` when building through EAS.

```powershell
npx eas-cli build --platform android --profile production
```

Expo Go is not sufficient because the app includes `onnxruntime-react-native`; use the EAS development profile for development builds that need the native ONNX module.

## Optional FastAPI Connection

The app always reads/writes local SQLite and runs local inference first. To sync to a computer on the same local network, start FastAPI from the repository root:

```powershell
C:\Python314\python.exe -m uvicorn backend.main:app --host 0.0.0.0 --port 8002
```

In the app, open **More → About & local data**, enter the computer's LAN address, for example `http://192.168.1.20:8002`, save it, and check the server. Find the computer address with `ipconfig`. The phone and computer must have local network reachability; internet access is not needed. Android permits cleartext traffic so the existing HTTP-only development API can be reached; configure only a trusted LAN URL. Production shared servers should use HTTPS, and the development API must not be exposed publicly.

The URL may also be supplied through `.env` as `EXPO_PUBLIC_API_BASE_URL`; an in-app override is stored in Expo SecureStore. Do not put credentials in the public Expo environment.

## Local Model Validation

The converter dependencies are isolated from the backend Python environment. For regeneration, create a temporary venv and install `tools/requirements-converter.txt`, then run:

```powershell
C:\path\to\converter-venv\Scripts\python.exe tools\export_models_onnx.py
```

Each generated model is checked with ONNX's checker and ONNX Runtime against the original joblib model. The utility refuses to accept a model if maximum absolute prediction error exceeds `1e-4`. The existing `models/*.joblib` files are inputs only and are never overwritten. The categorical string imputer export sentinel changes only on a deep copy; the mobile meal category is required/non-empty.

Current validated CPU parity (128 inputs each, including 128 real optimizer rows):

- Baseline 7-input model: max absolute error `3.3482e-6`.
- Optimization 16-input model: max absolute error `3.2264e-6`.
- Semi-supervised 7-input model: max absolute error `3.5984e-6`.

The semi-supervised model is included but not selected for normal recommendations because the existing API uses the baseline model and does not expose a semi-supervised endpoint.

## Offline and Sync Behavior

- Food records, prediction history, optimization history, analytics, CSV, and JSON backup/restore use app-private SQLite.
- Internet availability and the optional FastAPI health state are shown separately.
- Records are queued locally and can sync over LAN when the configured API is available. A duplicate create retry recovers by stable UUID. A changed server snapshot is surfaced as a conflict; the user chooses the local or server copy.
- Analytics stay local-first; shared API totals are supplemental and only loaded when the server is available.
- Camera permission is requested only when Camera is opened. Capture is supported; classification, weighing scales, and blockchain results are not faked or enabled.

Before release, run the app on a physical Android device, create/edit/delete records, force-stop/reopen, physically disconnect internet while preserving LAN/loopback, verify prediction and optimization, exercise conflict/backup/restore, and archive screenshots/logs. Emulator or browser tests do not count as a device PASS.

## Current Limitations

- Physical Android installation, native ONNX Runtime execution on Android, APK/AAB generation, and physical-network-offline tests remain unverified in the current environment because the Android SDK/ADB and device are absent.
- ONNX/Python parity has passed on this Windows host, but must be confirmed on-device before production.
- `npm audit` reports 8 advisories (5 low, 3 high) in the Expo dependency/tooling graph. npm's proposed forced fix downgrades Expo to SDK 51, so no forced downgrade was applied; review a compatible Expo patch before publishing.
- Android HTTP sync to an arbitrary LAN IP depends on Android cleartext/network policy and LAN security. For production, configure authenticated HTTPS on a trusted local server.
- No image classifier, scale integration, blockchain audit, or cloud authentication is included.
