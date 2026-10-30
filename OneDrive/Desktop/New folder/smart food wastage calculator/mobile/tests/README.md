# Mobile Automated Test Suite

Automated mobile tests validating SQLite migrations, persistence repository, offline sync queue, conflict resolution, and local ONNX model wrapper contracts.

## Running Tests

From the `mobile` directory:

```powershell
npm test
```

Or run individual suites with Node.js built-in test runner:

```powershell
node --test tests/01_migrations.test.mjs
node --test tests/02_repository.test.mjs
node --test tests/03_sync_conflict.test.mjs
node --test tests/04_model_wrapper.test.mjs
```

## Test Coverage

- **01_migrations.test.mjs**:
  - `PRAGMA user_version = 1` initialization and idempotency
  - Version guard (rejection of newer unsupported versions)
  - Table schemas (`food_records`, `prediction_history`, `optimization_history`, `sync_queue`, `app_meta`)
  - DB constraints (`meal_category` check, `deleted` check)

- **02_repository.test.mjs**:
  - Meal record creation and queueing in `sync_queue`
  - Physical check: consumed + wasted cannot exceed prepared food
  - Soft-delete (synced records) vs hard-delete (un-synced records)
  - Full backup JSON export and restore roundtrip
  - Rejection of corrupt or mismatched backup payloads without data corruption

- **03_sync_conflict.test.mjs**:
  - Server snapshot field comparison (`sameServerSnapshot`) with floating-point tolerance
  - Detection of concurrent server changes
  - Conflict marking (`sync_state = 'conflict'`)
  - Resolution by keeping local edits (`choice = 'local'`)
  - Resolution by accepting server snapshot (`choice = 'server'`)

- **04_model_wrapper.test.mjs**:
  - Verifying presence and non-trivial file sizes for bundled ONNX assets
  - Validating manifest feature names, ordering, and max absolute error tolerance
  - Preparation candidate range generation (0.7 to 1.3 in 0.5 kg steps)
  - Candidate penalty optimization logic (waste cost vs shortage penalty)
