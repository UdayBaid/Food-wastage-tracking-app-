import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createMockExpoDatabase } from './helpers/mockDb.mjs';

const CURRENT_SCHEMA_VERSION = 1;

async function migrateDatabase(database) {
  await database.execAsync('PRAGMA foreign_keys = ON;');
  const versionRow = await database.getFirstAsync('PRAGMA user_version');
  const version = versionRow?.user_version ?? 0;

  if (version < 1) {
    await database.withTransactionAsync(async () => {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS food_records (
          id TEXT PRIMARY KEY NOT NULL,
          record_id TEXT NOT NULL UNIQUE,
          server_id INTEGER UNIQUE,
          date TEXT NOT NULL,
          year INTEGER,
          month INTEGER,
          day_of_week INTEGER,
          day_name TEXT,
          meal_category TEXT NOT NULL CHECK (meal_category IN ('Breakfast', 'Lunch', 'Dinner')),
          menu_name TEXT,
          hostel_capacity INTEGER,
          residents_present INTEGER,
          advance_bookings INTEGER,
          weekend_flag INTEGER,
          exam_flag INTEGER,
          vacation_flag INTEGER,
          festival_flag INTEGER,
          special_event_flag INTEGER,
          temperature_c REAL,
          rain_index REAL,
          menu_popularity_score REAL,
          student_turnout INTEGER,
          avg_consumed_per_student_kg REAL,
          food_consumed_kg REAL,
          food_prepared_kg REAL,
          food_wasted_kg REAL,
          waste_percentage REAL,
          estimated_waste_cost_inr REAL,
          updated_at TEXT NOT NULL,
          synced_at TEXT,
          sync_state TEXT NOT NULL DEFAULT 'local',
          base_snapshot TEXT,
          conflict_snapshot TEXT,
          deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
        );
        CREATE INDEX IF NOT EXISTS idx_food_records_date ON food_records(date DESC);
        CREATE INDEX IF NOT EXISTS idx_food_records_sync ON food_records(sync_state, deleted);

        CREATE TABLE IF NOT EXISTS prediction_history (
          id TEXT PRIMARY KEY NOT NULL,
          meal_category TEXT NOT NULL,
          predicted_waste_kg REAL NOT NULL,
          input_json TEXT NOT NULL,
          model_name TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS optimization_history (
          id TEXT PRIMARY KEY NOT NULL,
          meal_category TEXT NOT NULL,
          expected_demand_kg REAL NOT NULL,
          recommended_preparation_kg REAL NOT NULL,
          predicted_waste_kg REAL NOT NULL,
          estimated_shortage_kg REAL NOT NULL,
          estimated_penalty_cost REAL NOT NULL,
          input_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sync_queue (
          entity_id TEXT PRIMARY KEY NOT NULL,
          entity_type TEXT NOT NULL,
          operation TEXT NOT NULL,
          queued_at TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT
        );

        CREATE TABLE IF NOT EXISTS app_meta (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
      `);
      await database.execAsync(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION};`);
    });
  }

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(`FoodWise data schema ${version} is newer than this app supports (${CURRENT_SCHEMA_VERSION}).`);
  }
}

describe('SQLite Migrations & Schema', () => {
  test('Initial migration sets user_version to 1 and creates required tables', async () => {
    const db = createMockExpoDatabase();
    await migrateDatabase(db);

    const versionRow = await db.getFirstAsync('PRAGMA user_version');
    assert.equal(versionRow.user_version, 1);

    const tables = await db.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const tableNames = tables.map((t) => t.name);

    assert.ok(tableNames.includes('food_records'));
    assert.ok(tableNames.includes('prediction_history'));
    assert.ok(tableNames.includes('optimization_history'));
    assert.ok(tableNames.includes('sync_queue'));
    assert.ok(tableNames.includes('app_meta'));
  });

  test('Running migration idempotently preserves existing user_version', async () => {
    const db = createMockExpoDatabase();
    await migrateDatabase(db);
    // Run second time
    await migrateDatabase(db);

    const versionRow = await db.getFirstAsync('PRAGMA user_version');
    assert.equal(versionRow.user_version, 1);
  });

  test('Throws descriptive error when schema version is newer than supported', async () => {
    const db = createMockExpoDatabase();
    await db.execAsync('PRAGMA user_version = 99;');

    await assert.rejects(
      async () => {
        await migrateDatabase(db);
      },
      {
        message: /FoodWise data schema 99 is newer than this app supports/,
      }
    );
  });

  test('Validates table constraints on food_records (meal_category and deleted flags)', async () => {
    const db = createMockExpoDatabase();
    await migrateDatabase(db);

    // Invalid meal category should throw CHECK constraint failure
    await assert.rejects(
      async () => {
        await db.runAsync(`
          INSERT INTO food_records (id, record_id, date, meal_category, updated_at)
          VALUES ('1', 'rec-1', '2026-10-30', 'MidnightSnack', '2026-10-30T00:00:00Z')
        `);
      },
      /CHECK constraint failed/
    );

    // Valid meal category succeeds
    const res = await db.runAsync(`
      INSERT INTO food_records (id, record_id, date, meal_category, updated_at)
      VALUES ('1', 'rec-1', '2026-10-30', 'Breakfast', '2026-10-30T00:00:00Z')
    `);
    assert.equal(res.changes, 1);
  });
});

