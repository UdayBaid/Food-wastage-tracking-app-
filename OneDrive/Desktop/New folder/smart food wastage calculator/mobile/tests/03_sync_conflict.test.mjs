import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMockExpoDatabase } from './helpers/mockDb.mjs';

const SERVER_FIELDS = [
  'record_id', 'date', 'year', 'month', 'day_of_week', 'day_name', 'meal_category', 'menu_name',
  'hostel_capacity', 'residents_present', 'advance_bookings', 'weekend_flag', 'exam_flag', 'vacation_flag',
  'festival_flag', 'special_event_flag', 'temperature_c', 'rain_index', 'menu_popularity_score', 'student_turnout',
  'avg_consumed_per_student_kg', 'food_consumed_kg', 'food_prepared_kg', 'food_wasted_kg', 'waste_percentage',
  'estimated_waste_cost_inr',
];

function sameServerSnapshot(snapshotJson, server) {
  if (!snapshotJson) return false;
  let snapshot;
  try { snapshot = JSON.parse(snapshotJson); }
  catch { return false; }
  return SERVER_FIELDS.every((field) => {
    const localValue = snapshot[field];
    const remoteValue = server[field];
    if (localValue == null && remoteValue == null) return true;
    if (typeof localValue === 'number' && typeof remoteValue === 'number') {
      return Math.abs(localValue - remoteValue) < 1e-8;
    }
    return String(localValue ?? '') === String(remoteValue ?? '');
  });
}

async function setupSyncDb() {
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
    CREATE TABLE IF NOT EXISTS sync_queue (
      entity_id TEXT PRIMARY KEY NOT NULL,
      entity_type TEXT NOT NULL,
      operation TEXT NOT NULL,
      queued_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    );
  `);
  return db;
}

async function markConflict(database, recordId, remote) {
  await database.runAsync(
    "UPDATE food_records SET sync_state='conflict', conflict_snapshot=? WHERE id=?",
    JSON.stringify(remote), recordId
  );
  await database.runAsync(
    "UPDATE sync_queue SET last_error='Remote record changed; resolve conflict locally.' WHERE entity_id=?",
    recordId
  );
}

async function resolveRecordConflict(database, id, choice) {
  const record = await database.getFirstAsync('SELECT * FROM food_records WHERE id = ?', id);
  if (!record?.conflict_snapshot) throw new Error('This record no longer has a server conflict.');
  const remote = JSON.parse(record.conflict_snapshot);
  const timestamp = new Date().toISOString();

  if (choice === 'local') {
    await database.withTransactionAsync(async () => {
      await database.runAsync(
        "UPDATE food_records SET server_id=?, sync_state='pending', base_snapshot=?, conflict_snapshot=NULL, updated_at=? WHERE id=?",
        Number(remote.id), JSON.stringify(remote), timestamp, id
      );
      await database.runAsync(
        `INSERT INTO sync_queue(entity_id, entity_type, operation, queued_at, attempts, last_error)
         VALUES (?, 'food_record', 'upsert', ?, 0, NULL)
         ON CONFLICT(entity_id) DO UPDATE SET operation=excluded.operation, queued_at=excluded.queued_at, last_error=NULL`,
        id, timestamp
      );
    });
    return;
  }

  // choice === 'server'
  const fields = [
    'date', 'year', 'month', 'day_of_week', 'day_name', 'meal_category', 'menu_name', 'hostel_capacity',
    'residents_present', 'advance_bookings', 'weekend_flag', 'exam_flag', 'vacation_flag', 'festival_flag',
    'special_event_flag', 'temperature_c', 'rain_index', 'menu_popularity_score', 'student_turnout',
    'avg_consumed_per_student_kg', 'food_consumed_kg', 'food_prepared_kg', 'food_wasted_kg',
    'waste_percentage', 'estimated_waste_cost_inr',
  ];
  await database.withTransactionAsync(async () => {
    const assignments = fields.map((field) => `${field}=?`).join(',');
    await database.runAsync(
      `UPDATE food_records SET ${assignments}, server_id=?, sync_state='synced', synced_at=?, updated_at=?, base_snapshot=?, conflict_snapshot=NULL WHERE id=?`,
      ...fields.map((field) => remote[field] ?? null),
      Number(remote.id), timestamp, timestamp, JSON.stringify(remote), id
    );
    await database.runAsync('DELETE FROM sync_queue WHERE entity_id=?', id);
  });
}

describe('Sync Queue & Server Conflict Resolution', () => {
  let db;

  beforeEach(async () => {
    db = await setupSyncDb();
  });

  test('sameServerSnapshot accurately matches identical remote objects within float tolerance', () => {
    const local = {
      record_id: 'REC-001',
      date: '2026-10-30',
      food_prepared_kg: 50.000000001,
      food_wasted_kg: 5.0,
      meal_category: 'Lunch',
    };
    const remote = {
      record_id: 'REC-001',
      date: '2026-10-30',
      food_prepared_kg: 50.0,
      food_wasted_kg: 5.0,
      meal_category: 'Lunch',
    };

    assert.equal(sameServerSnapshot(JSON.stringify(local), remote), true);
  });

  test('sameServerSnapshot detects remote changes', () => {
    const base = {
      record_id: 'REC-001',
      date: '2026-10-30',
      food_wasted_kg: 5.0,
    };
    const remoteChanged = {
      record_id: 'REC-001',
      date: '2026-10-30',
      food_wasted_kg: 12.0, // Modified on server
    };

    assert.equal(sameServerSnapshot(JSON.stringify(base), remoteChanged), false);
  });

  test('markConflict sets sync_state to conflict and records snapshot', async () => {
    const recordId = 'REC-UUID-123';
    await db.runAsync(`
      INSERT INTO food_records (id, record_id, date, meal_category, updated_at, sync_state)
      VALUES (?, 'rec-1', '2026-10-30', 'Lunch', '2026-10-30T00:00:00Z', 'pending')
    `, recordId);
    await db.runAsync(`
      INSERT INTO sync_queue (entity_id, entity_type, operation, queued_at)
      VALUES (?, 'food_record', 'upsert', '2026-10-30T00:00:00Z')
    `, recordId);

    const remote = { id: 42, record_id: 'rec-1', food_wasted_kg: 10.5 };
    await markConflict(db, recordId, remote);

    const updated = await db.getFirstAsync('SELECT * FROM food_records WHERE id = ?', recordId);
    assert.equal(updated.sync_state, 'conflict');
    assert.deepEqual(JSON.parse(updated.conflict_snapshot), remote);

    const queueRow = await db.getFirstAsync('SELECT * FROM sync_queue WHERE entity_id = ?', recordId);
    assert.match(queueRow.last_error, /Remote record changed/);
  });

  test('resolveRecordConflict with choice = local preserves local edits and re-queues', async () => {
    const recordId = 'REC-LOCAL-1';
    const remote = { id: 77, record_id: 'rec-local', food_wasted_kg: 8.0, meal_category: 'Dinner', date: '2026-10-30' };

    await db.runAsync(`
      INSERT INTO food_records (id, record_id, date, meal_category, food_wasted_kg, updated_at, sync_state, conflict_snapshot)
      VALUES (?, 'rec-local', '2026-10-30', 'Dinner', 5.0, '2026-10-30T00:00:00Z', 'conflict', ?)
    `, recordId, JSON.stringify(remote));

    await resolveRecordConflict(db, recordId, 'local');

    const resolved = await db.getFirstAsync('SELECT * FROM food_records WHERE id = ?', recordId);
    assert.equal(resolved.sync_state, 'pending');
    assert.equal(resolved.food_wasted_kg, 5.0); // Retained local value!
    assert.equal(resolved.conflict_snapshot, null);
    assert.equal(resolved.server_id, 77);

    const queueRow = await db.getFirstAsync('SELECT * FROM sync_queue WHERE entity_id = ?', recordId);
    assert.ok(queueRow);
    assert.equal(queueRow.operation, 'upsert');
  });

  test('resolveRecordConflict with choice = server updates to remote and cleans queue', async () => {
    const recordId = 'REC-SERVER-1';
    const remote = {
      id: 88,
      record_id: 'rec-server',
      food_wasted_kg: 14.5,
      food_prepared_kg: 60.0,
      food_consumed_kg: 45.0,
      meal_category: 'Lunch',
      date: '2026-10-30'
    };

    await db.runAsync(`
      INSERT INTO food_records (id, record_id, date, meal_category, food_wasted_kg, updated_at, sync_state, conflict_snapshot)
      VALUES (?, 'rec-server', '2026-10-30', 'Lunch', 2.0, '2026-10-30T00:00:00Z', 'conflict', ?)
    `, recordId, JSON.stringify(remote));

    await db.runAsync(`
      INSERT INTO sync_queue (entity_id, entity_type, operation, queued_at)
      VALUES (?, 'food_record', 'upsert', '2026-10-30T00:00:00Z')
    `, recordId);

    await resolveRecordConflict(db, recordId, 'server');

    const resolved = await db.getFirstAsync('SELECT * FROM food_records WHERE id = ?', recordId);
    assert.equal(resolved.sync_state, 'synced');
    assert.equal(resolved.food_wasted_kg, 14.5); // Remote value applied!
    assert.equal(resolved.conflict_snapshot, null);

    const queueRow = await db.getFirstAsync('SELECT * FROM sync_queue WHERE entity_id = ?', recordId);
    assert.equal(queueRow, null); // Removed from queue!
  });
});

