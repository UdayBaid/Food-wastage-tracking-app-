import type { SQLiteDatabase } from 'expo-sqlite';

const CURRENT_SCHEMA_VERSION = 1;

export async function migrateDatabase(database: SQLiteDatabase): Promise<void> {
  await database.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const versionRow = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
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
