import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createMockExpoDatabase } from './helpers/mockDb.mjs';

const nowIso = () => new Date().toISOString();
const nullable = (val) => val ?? null;

const RECORD_COLUMNS = [
  'id', 'record_id', 'server_id', 'date', 'year', 'month', 'day_of_week', 'day_name', 'meal_category', 'menu_name',
  'hostel_capacity', 'residents_present', 'advance_bookings', 'weekend_flag', 'exam_flag', 'vacation_flag',
  'festival_flag', 'special_event_flag', 'temperature_c', 'rain_index', 'menu_popularity_score', 'student_turnout',
  'avg_consumed_per_student_kg', 'food_consumed_kg', 'food_prepared_kg', 'food_wasted_kg', 'waste_percentage',
  'estimated_waste_cost_inr', 'updated_at', 'synced_at', 'sync_state', 'base_snapshot', 'conflict_snapshot', 'deleted',
];

async function setupTestDb() {
  const db = createMockExpoDatabase();
  await db.execAsync(`
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
    PRAGMA user_version = 1;
  `);
  return db;
}

function queueRecord(database, entityId, operation, queuedAt) {
  return database.runAsync(
    `INSERT INTO sync_queue(entity_id, entity_type, operation, queued_at, attempts, last_error)
     VALUES (?, 'food_record', ?, ?, 0, NULL)
     ON CONFLICT(entity_id) DO UPDATE SET operation=excluded.operation, queued_at=excluded.queued_at, last_error=NULL`,
    entityId, operation, queuedAt
  );
}

async function getRecord(database, id) {
  return database.getFirstAsync('SELECT * FROM food_records WHERE id = ?', id);
}

async function listRecords(database, includeDeleted = false) {
  return database.getAllAsync(
    `SELECT * FROM food_records ${includeDeleted ? '' : 'WHERE deleted = 0'} ORDER BY date DESC, updated_at DESC`
  );
}

async function saveRecord(database, input, id) {
  const timestamp = nowIso();
  const recordId = id ?? randomUUID();
  const current = id ? await getRecord(database, id) : null;
  const dateObj = new Date(`${input.date}T00:00:00Z`);

  const values = {
    date: input.date,
    year: input.year ?? dateObj.getUTCFullYear(),
    month: input.month ?? dateObj.getUTCMonth() + 1,
    day_of_week: input.day_of_week ?? (dateObj.getUTCDay() + 6) % 7,
    day_name: input.day_name ?? dateObj.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
    meal_category: input.meal_category,
    menu_name: nullable(input.menu_name),
    hostel_capacity: nullable(input.hostel_capacity),
    residents_present: nullable(input.residents_present),
    advance_bookings: nullable(input.advance_bookings),
    weekend_flag: nullable(input.weekend_flag ?? (dateObj.getUTCDay() === 0 || dateObj.getUTCDay() === 6 ? 1 : 0)),
    exam_flag: nullable(input.exam_flag),
    vacation_flag: nullable(input.vacation_flag),
    festival_flag: nullable(input.festival_flag),
    special_event_flag: nullable(input.special_event_flag),
    temperature_c: nullable(input.temperature_c),
    rain_index: nullable(input.rain_index),
    menu_popularity_score: nullable(input.menu_popularity_score),
    student_turnout: nullable(input.student_turnout),
    avg_consumed_per_student_kg: nullable(input.avg_consumed_per_student_kg),
    food_consumed_kg: nullable(input.food_consumed_kg),
    food_prepared_kg: nullable(input.food_prepared_kg),
    food_wasted_kg: nullable(input.food_wasted_kg),
    waste_percentage: nullable(input.waste_percentage),
    estimated_waste_cost_inr: nullable(input.estimated_waste_cost_inr),
  };

  if (Number(values.food_consumed_kg ?? 0) + Number(values.food_wasted_kg ?? 0) > Number(values.food_prepared_kg ?? 0)) {
    throw new Error('Consumed plus wasted food cannot exceed prepared food.');
  }

  await database.withTransactionAsync(async () => {
    if (current) {
      await database.runAsync(
        `UPDATE food_records SET
          date=?, year=?, month=?, day_of_week=?, day_name=?, meal_category=?, menu_name=?, hostel_capacity=?,
          residents_present=?, advance_bookings=?, weekend_flag=?, exam_flag=?, vacation_flag=?, festival_flag=?,
          special_event_flag=?, temperature_c=?, rain_index=?, menu_popularity_score=?, student_turnout=?,
          avg_consumed_per_student_kg=?, food_consumed_kg=?, food_prepared_kg=?, food_wasted_kg=?,
          waste_percentage=?, estimated_waste_cost_inr=?, updated_at=?, sync_state='pending', deleted=0
         WHERE id=?`,
        values.date, values.year, values.month, values.day_of_week, values.day_name, values.meal_category,
        values.menu_name, values.hostel_capacity, values.residents_present, values.advance_bookings,
        values.weekend_flag, values.exam_flag, values.vacation_flag, values.festival_flag, values.special_event_flag,
        values.temperature_c, values.rain_index, values.menu_popularity_score, values.student_turnout,
        values.avg_consumed_per_student_kg, values.food_consumed_kg, values.food_prepared_kg,
        values.food_wasted_kg, values.waste_percentage, values.estimated_waste_cost_inr, timestamp, recordId,
      );
    } else {
      await database.runAsync(
        `INSERT INTO food_records (
          id, record_id, date, year, month, day_of_week, day_name, meal_category, menu_name, hostel_capacity,
          residents_present, advance_bookings, weekend_flag, exam_flag, vacation_flag, festival_flag,
          special_event_flag, temperature_c, rain_index, menu_popularity_score, student_turnout,
          avg_consumed_per_student_kg, food_consumed_kg, food_prepared_kg, food_wasted_kg, waste_percentage,
          estimated_waste_cost_inr, updated_at, sync_state
        ) VALUES (${new Array(28).fill('?').join(',')}, 'pending')`,
        recordId, recordId, values.date, values.year, values.month, values.day_of_week, values.day_name,
        values.meal_category, values.menu_name, values.hostel_capacity, values.residents_present,
        values.advance_bookings, values.weekend_flag, values.exam_flag, values.vacation_flag,
        values.festival_flag, values.special_event_flag, values.temperature_c, values.rain_index,
        values.menu_popularity_score, values.student_turnout, values.avg_consumed_per_student_kg,
        values.food_consumed_kg, values.food_prepared_kg, values.food_wasted_kg, values.waste_percentage,
        values.estimated_waste_cost_inr, timestamp,
      );
    }
    await queueRecord(database, recordId, 'upsert', timestamp);
  });
  return recordId;
}

async function deleteRecord(database, id) {
  const record = await getRecord(database, id);
  if (!record) return;
  const timestamp = nowIso();
  await database.withTransactionAsync(async () => {
    if (record.server_id == null) {
      await database.runAsync('DELETE FROM food_records WHERE id=?', id);
      await database.runAsync('DELETE FROM sync_queue WHERE entity_id=?', id);
      return;
    }
    await database.runAsync("UPDATE food_records SET deleted=1, sync_state='pending-delete', updated_at=? WHERE id=?", timestamp, id);
    await queueRecord(database, id, 'delete', timestamp);
  });
}

async function exportBackupData(database) {
  const records = await listRecords(database, true);
  const predictions = await database.getAllAsync('SELECT * FROM prediction_history ORDER BY created_at');
  const optimizations = await database.getAllAsync('SELECT * FROM optimization_history ORDER BY created_at');
  return { app: 'FoodWise', schemaVersion: 1, exportedAt: nowIso(), records, predictions, optimizations };
}

async function restoreBackupData(database, payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Backup file is not a FoodWise data export.');
  const backup = payload;
  if (backup.app !== 'FoodWise' || backup.schemaVersion !== 1 || !Array.isArray(backup.records) || !Array.isArray(backup.predictions) || !Array.isArray(backup.optimizations)) {
    throw new Error('Backup format or schema version is not supported.');
  }
  const allowedColumns = new Set(RECORD_COLUMNS);
  const recordIds = new Set();
  const externalIds = new Set();
  for (const record of backup.records) {
    if (!record.id || !record.record_id || !record.date || !['Breakfast', 'Lunch', 'Dinner'].includes(record.meal_category)) {
      throw new Error('Backup contains an invalid food record. No data was changed.');
    }
    if (Object.keys(record).some((key) => !allowedColumns.has(key))) {
      throw new Error('Backup contains unknown food record fields. No data was changed.');
    }
    if (recordIds.has(record.id) || externalIds.has(record.record_id)) {
      throw new Error('Backup contains duplicate food record identifiers. No data was changed.');
    }
    recordIds.add(record.id);
    externalIds.add(record.record_id);
    if (record.food_prepared_kg != null && record.food_consumed_kg != null && record.food_wasted_kg != null
      && record.food_consumed_kg + record.food_wasted_kg > record.food_prepared_kg) {
      throw new Error('Backup contains food quantities where consumed plus wasted exceeds prepared. No data was changed.');
    }
  }

  await database.withTransactionAsync(async () => {
    await database.execAsync('DELETE FROM sync_queue; DELETE FROM food_records; DELETE FROM prediction_history; DELETE FROM optimization_history;');
    for (const record of backup.records ?? []) {
      const columns = RECORD_COLUMNS.filter((column) => column in record);
      const placeholders = columns.map(() => '?').join(',');
      await database.runAsync(
        `INSERT INTO food_records(${columns.join(',')}) VALUES (${placeholders})`,
        ...columns.map((column) => record[column] ?? null),
      );
      if (record.sync_state !== 'synced') await queueRecord(database, record.id, record.deleted ? 'delete' : 'upsert', nowIso());
    }
  });
  return backup.records.length;
}

describe('Repository & Local Persistence', () => {
  let db;

  beforeEach(async () => {
    db = await setupTestDb();
  });

  test('saveRecord creates a new record and queues it in sync_queue', async () => {
    const id = await saveRecord(db, {
      date: '2026-10-30',
      meal_category: 'Lunch',
      food_prepared_kg: 50.0,
      food_consumed_kg: 42.0,
      food_wasted_kg: 5.0,
      student_turnout: 120,
    });

    const record = await getRecord(db, id);
    assert.ok(record);
    assert.equal(record.meal_category, 'Lunch');
    assert.equal(record.sync_state, 'pending');

    const queued = await db.getFirstAsync('SELECT * FROM sync_queue WHERE entity_id = ?', id);
    assert.ok(queued);
    assert.equal(queued.operation, 'upsert');
  });

  test('Physical check: consumed + wasted > prepared throws Error', async () => {
    await assert.rejects(
      async () => {
        await saveRecord(db, {
          date: '2026-10-30',
          meal_category: 'Dinner',
          food_prepared_kg: 50.0,
          food_consumed_kg: 45.0,
          food_wasted_kg: 10.0, // 45 + 10 = 55 > 50!
        });
      },
      /Consumed plus wasted food cannot exceed prepared food/
    );
  });

  test('Hard-deletes local un-synced record, soft-deletes synced record', async () => {
    // 1. Un-synced record (server_id is null)
    const localId = await saveRecord(db, {
      date: '2026-10-30',
      meal_category: 'Breakfast',
      food_prepared_kg: 20.0,
      food_consumed_kg: 18.0,
      food_wasted_kg: 1.0,
    });
    await deleteRecord(db, localId);
    assert.equal(await getRecord(db, localId), null);

    // 2. Synced record (server_id is set)
    const syncedId = await saveRecord(db, {
      date: '2026-10-30',
      meal_category: 'Breakfast',
      food_prepared_kg: 30.0,
      food_consumed_kg: 25.0,
      food_wasted_kg: 3.0,
    });
    await db.runAsync("UPDATE food_records SET server_id = 101, sync_state = 'synced' WHERE id = ?", syncedId);

    await deleteRecord(db, syncedId);
    const softDeleted = await getRecord(db, syncedId);
    assert.ok(softDeleted);
    assert.equal(softDeleted.deleted, 1);
    assert.equal(softDeleted.sync_state, 'pending-delete');

    const activeList = await listRecords(db, false);
    assert.equal(activeList.length, 0);

    const allList = await listRecords(db, true);
    assert.equal(allList.length, 1);
  });

  test('Backup export and restore roundtrip preserves records', async () => {
    const id = await saveRecord(db, {
      date: '2026-10-29',
      meal_category: 'Dinner',
      food_prepared_kg: 40.0,
      food_consumed_kg: 35.0,
      food_wasted_kg: 3.5,
      student_turnout: 95,
    });

    const backup = await exportBackupData(db);
    assert.equal(backup.app, 'FoodWise');
    assert.equal(backup.schemaVersion, 1);
    assert.equal(backup.records.length, 1);

    // Create a new clean DB and restore
    const cleanDb = await setupTestDb();
    const count = await restoreBackupData(cleanDb, backup);
    assert.equal(count, 1);

    const restored = await getRecord(cleanDb, id);
    assert.ok(restored);
    assert.equal(restored.meal_category, 'Dinner');
  });

  test('Rejects corrupt backup format without mutating data', async () => {
    const corruptBackup = {
      app: 'WrongApp',
      schemaVersion: 1,
      records: [],
    };

    await assert.rejects(
      async () => {
        await restoreBackupData(db, corruptBackup);
      },
      /Backup format or schema version is not supported/
    );
  });
});

