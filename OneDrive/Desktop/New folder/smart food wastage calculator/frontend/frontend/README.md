# FoodWise Frontend

FoodWise is the React/Vite interface for the Smart Food Waste Tracking API.

## Run locally

From the project root, start the FastAPI backend in one terminal:

```powershell
C:\Python314\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8002
```

The frontend lives in `frontend/frontend`. In a second terminal:

```powershell
Set-Location "C:\Users\udot\OneDrive\Desktop\New folder\smart food wastage calculator\frontend\frontend"
npm install
npm run dev
```

Open the Vite URL printed in the terminal, normally `http://127.0.0.1:5173`.
The development server proxies `/api` requests to `http://127.0.0.1:8002`, avoiding the need to enable cross-origin requests in FastAPI.
`C:\Python314\python.exe` is the tested backend interpreter in this workspace; the checked-in `.venv` currently has no backend dependencies installed. Install the project requirements into the chosen interpreter before disconnecting from the internet.

## API configuration

Copy `.env.example` to `.env.local` when the backend uses a different port, then set `VITE_API_PROXY_TARGET` to the backend origin and restart Vite. `VITE_API_BASE_URL` defaults to `/api`; keep that value to use the proxy.
For future portable desktop packaging, set `FOODWISE_DATA_DIR` before starting FastAPI. It defaults to the existing project `database` folder and does not move or replace current records.

## Checks

```powershell
npm run lint
npm run build
```

## Installable offline app

The service worker is enabled in production builds, not the Vite development server. Build and preview it locally while the backend is already running:

```powershell
npm run build
npm run preview -- --host 127.0.0.1
```

Open the printed localhost URL in Edge or Chrome and use the browser's install-app control. The worker precaches the versioned app shell, hashed JS/CSS chunks, manifest, icon, and offline fallback. It never caches `/api` requests. On a later release it keeps the old cache until the new shell is downloaded and asks before activating the update.

With the operating system's network disconnected, reopen the installed app or revisit its localhost origin: cached routes and static UI remain available. Database reads/writes, model inference, and reports still need the local FastAPI process and SQLite file; internet access is not needed for those local requests. Browser offline mode may block localhost too, so validate disconnected operation by disabling external network access while leaving loopback available, not by forcing the browser to reject every request.

The status labels distinguish browser network status from the local FastAPI/SQLite/model health at `/health/local`. Start the local backend before using data or inference pages.

## Local database backup

On the About page, use **Download database backup** to download a SQLite copy. **Restore from backup** asks for confirmation, validates SQLite integrity and required FoodWise tables, creates a safety copy in the reported local backup folder, then restores. Restore uploads are limited to 100 MB. The backend reports the absolute database and backup paths at `/database/info`.

## Data notes

The record form maps people served to the backend's `student_turnout` field. The current FoodRecord API does not include a notes field, so Notes are disabled instead of being silently discarded. Weekly reports are grouped from retrieved record dates because the backend trend endpoint supports daily and monthly periods only. Alert prompts use labeled frontend rules; the backend does not provide an alert feed. The semi-supervised model file is present locally but has no existing inference endpoint, so this phase does not invent or replace that functionality.