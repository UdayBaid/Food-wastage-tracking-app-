# FoodWise Phase 5: Windows Physical-Offline Test

**Status: NOT COMPLETE.** The offline browser emulator is not a substitute for this procedure. Do not mark Phase 5 complete until the physical-offline rows below all pass on the target Windows machine and browser.

## Safety and Test Setup

Use an isolated SQLite directory so test records and inference history cannot alter the existing `database/food_waste.db`:

1. Open a PowerShell terminal at the project root.
2. Choose a new, empty test-data directory and start FastAPI with it:

```powershell
$env:FOODWISE_DATA_DIR = Join-Path $env:TEMP ("FoodWise-Phase5-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
$env:FOODWISE_TEST_DATA_DIR = $env:FOODWISE_DATA_DIR
C:\Python314\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8002
```

Keep this terminal open. If Python 3.14 is not the selected interpreter, replace the executable with the interpreter where the project requirements are already installed. Do not install dependencies after disconnecting the network.

3. In a second PowerShell terminal, start the production-built frontend and its local `/api` proxy:

```powershell
Set-Location "frontend\frontend"
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

Keep this terminal open during the test. The current PWA uses the Vite preview server to serve its app shell and proxy `/api` to FastAPI. If the preview process is stopped, cached pages may still open, but the current `/api` proxy is no longer available.

4. Confirm the diagnostics while still online, then install the PWA as described below. Keep the application data directory and both terminal processes unchanged for the offline run.

## Install and Prime the PWA

1. In Microsoft Edge or Google Chrome, open `http://127.0.0.1:4173/`.
2. Install FoodWise using the browser's Install app control. Confirm the installed app opens at the same localhost origin.
3. Open DevTools (`F12`) > **Application** > **Service Workers**. Record the service-worker script URL, status `activated`, and that the page is controlled by a service worker.
4. In **Application** > **Cache Storage**, inspect the active `foodwise-shell-<version>` cache. It should include the app entry/index, `offline.html`, `manifest.webmanifest`, the FoodWise icon, hashed JavaScript/CSS, and route chunks. Confirm no `/api` responses are cached.
5. Capture a screenshot of the installed app, service worker, and cache entries. If registration or required assets are missing, record **FAIL** and stop; do not continue as if offline support passed.

The PowerShell diagnostic checks that the manifest, worker script, and fallback page are served over localhost. It cannot inspect a browser's service-worker registration or Cache Storage; that check must be performed in DevTools.

## Physical Offline Run

1. While both local processes remain running, physically disconnect the computer from the internet: disconnect Wi-Fi, unplug Ethernet, or disable the upstream internet connection. Do not use Playwright/browser offline emulation or DevTools' offline toggle.
2. Keep the backend bound to `127.0.0.1`. Loopback traffic is local and should remain available even though external internet is disconnected.
3. From a third PowerShell terminal at the project root, run:

```powershell
.\scripts\phase5-offline-diagnostics.ps1 -FrontendUrl http://127.0.0.1:4173 -BackendUrl http://127.0.0.1:8002 -InternetExpectation Offline -RunInference
```

`-RunInference` writes one prediction and one optimization history entry. Use only the isolated test database above. The external TCP check is a connectivity probe, not proof about every possible internet route; note the probe result and the Windows network state in the evidence.

4. In the installed PWA, reload the Dashboard and visit Reports and Recommendations. Confirm the pages render from the service-worker cache. The Network status badge may reflect Windows/browser connectivity, but it does not prove that the local backend is reachable; use `/health/local` and the diagnostic output for that distinction.
5. Use **Log entry** to create one record with a unique menu name such as `PHASE5-OFFLINE-<timestamp>`. Retrieve it in Reports, edit one field, save, reload, and confirm the edit remains. Record its database ID for cleanup.
6. In Recommendations, submit a prediction and an optimization. Confirm each result and its history entry. In Reports, confirm analytics/charts include the test record and export CSV. Do not use cloud services or external AI APIs.
7. Verify the three distinct failure diagnoses:
   - **Internet unavailable:** external connectivity probe fails while the local backend remains healthy.
   - **Local backend unavailable:** stop FastAPI only; the app shell remains available, while `/health/local` and API actions fail with a local-backend message. Restart FastAPI before continuing.
   - **Service worker/cache failure:** with network disconnected, unregistering the worker or deleting the active cache should make the app shell fail to load. Re-register/prime it before continuing. This is a deliberate negative test; capture evidence, then restore the worker/cache and verify the app again.
   - **ML model loading/inference failure:** with the backend reachable, a missing/unloadable model or failed inference must be visible in the diagnostic output and backend logs. Do not delete or rename production model files to induce this; use an isolated test copy if deliberately simulating this failure.
8. Restart FastAPI while internet is still disconnected: stop only the backend process with `Ctrl+C`, start it again in the same terminal with the same `$env:FOODWISE_DATA_DIR`, and wait for startup completion. Keep the frontend preview process running.
9. Close and reopen the installed PWA while still disconnected. Confirm cached UI loads, `/health/local` returns healthy over localhost, the test record and its edit remain, and inference/analytics still work.
10. Restore internet only after capturing the evidence. Delete the unique test record through the UI if desired; the test database itself is isolated under `%TEMP%` and does not replace project data.

## Diagnostic Interpretation

`phase5-offline-diagnostics.ps1` reports one status per check:

- `Internet unavailable`: **PASS** means the configured external TCP probe could not connect while offline was expected; **FAIL** means it could connect.
- `Local FastAPI backend`: direct localhost `/health/local` reachability, independent of internet status.
- `Frontend-to-backend API proxy`: confirms the frontend's local `/api` path reaches FastAPI.
- `SQLite availability`: requires both the health flag and the reported database file to exist.
- `Local model artifacts`: checks the health endpoint's model-file flags only; it is not an inference test.
- `Prediction inference` and `Preparation optimization inference`: run only with `-RunInference`; HTTP errors are reported as model/inference failures and create history rows.
- `PWA manifest`, `Service worker script`, and `Offline fallback`: checks localhost HTTP assets. `Browser service worker and Cache Storage` remains `NOT TESTED` until verified in DevTools.

Exit code `0` means all script checks passed. Exit code `1` means at least one check failed. Exit code `2` means no script check failed but a browser-only/manual check remains `NOT TESTED`.

## Test Record

Record the tester, date, Windows version, browser/version, external probe target, and evidence file paths. Keep screenshots, diagnostic output, and backend startup logs together.

### Current Evidence (2026-10-30)

These are preliminary checks already performed in the development environment. They are not a physical internet-disconnect run.

| Test | Status | Evidence |
| --- | --- | --- |
| 1. PWA installed in target browser | NOT TESTED | Browser tab used; no actual Edge/Chrome install was performed. |
| 2. Service worker registration and cache contents | PASS | Browser page was controlled by `/sw.js`; versioned cache contained app shell, offline page, manifest, icon, hashed JS/CSS and route chunks; `/api` was not cached. |
| 3. Frontend after physical internet disconnect | NOT TESTED | Browser offline emulation loaded cached Reports/About after the worker cache fix, but no physical disconnect was performed. |
| 4. Local FastAPI while internet is physically disconnected | NOT TESTED | Backend was healthy online. Browser emulation blocked localhost requests, so it could not establish the physical-offline case. |
| 5. SQLite create, retrieve, update, and persistence | NOT TESTED | UI create/retrieve and backend restart persistence passed using a temporary DB; update was not exercised. |
| 6. `/predict` without internet | NOT TESTED | Local UI prediction returned 4.59 kg while internet was available; no physical-offline inference run. |
| 7. `/optimize` without internet | NOT TESTED | Local UI optimization returned a 3.6 kg recommendation while internet was available; no physical-offline inference run. |
| 8. Analytics and reports without internet | NOT TESTED | Reports/charts loaded from the project DB online; no physical-offline reports run. |
| 9. PWA and backend restart while physically offline | NOT TESTED | Backend restart and temporary-DB persistence passed while online; installed-app restart while physically disconnected was not tested. |

### Physical Offline Run

| Test | Status (PASS / FAIL / NOT TESTED) | Evidence / screenshot / log path |
| --- | --- | --- |
| 1. PWA installation | NOT TESTED | |
| 2. Service worker and cache contents | NOT TESTED | |
| 3. Frontend loads after physical disconnect | NOT TESTED | |
| 4. Local API works after physical disconnect | NOT TESTED | |
| 5. SQLite CRUD and restart persistence | NOT TESTED | |
| 6. Local prediction | NOT TESTED | |
| 7. Local optimization | NOT TESTED | |
| 8. Analytics, reports, and CSV export | NOT TESTED | |
| 9. PWA/backend restart while disconnected | NOT TESTED | |
| Internet unavailable / external probe | NOT TESTED | |
| Backend-unavailable diagnosis | NOT TESTED | |
| Service-worker/cache-failure diagnosis | NOT TESTED | |
| Model-loading/inference-failure diagnosis | NOT TESTED | |

**Completion rule:** Phase 5 remains incomplete until all nine physical-offline tests pass, all four failure diagnoses are evidenced, and any failures are fixed and rerun. Do not convert a simulator result into a physical-offline PASS.
