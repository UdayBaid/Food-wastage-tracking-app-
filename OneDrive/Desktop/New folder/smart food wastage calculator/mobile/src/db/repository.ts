import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  FoodRecord,
  FoodRecordInput,
  MealCategory,
  OptimizationHistory,
  OptimizationInput,
  OptimizationResult,
  PredictionHistory,
  PredictionInput,
} from '../domain/types';

const nowIso = () => new Date().toISOString();
const nullable = (value: number | string | null | undefined) => value ?? null;
const RECORD_COLUMNS = [
  'id', 'record_id', 'server_id', 'date', 'year', 'month', 'day_of_week', 'day_name', 'meal_category', 'menu_name',
  'hostel_capacity', 'residents_present', 'advance_bookings', 'weekend_flag', 'exam_flag', 'vacation_flag',
  'festival_flag', 'special_event_flag', 'temperature_c', 'rain_index', 'menu_popularity_score', 'student_turnout',
  'avg_consumed_per_student_kg', 'food_consumed_kg', 'food_prepared_kg', 'food_wasted_kg', 'waste_percentage',
  'estimated_waste_cost_inr', 'updated_at', 'synced_at', 'sync_state', 'base_snapshot', 'conflict_snapshot', 'deleted',
] as const;

function queueRecord(database: SQLiteDatabase, entityId: string, operation: string, queuedAt: string) {
  return database.runAsync(
    `INSERT INTO sync_queue(entity_id, entity_type, operation, queued_at, attempts, last_error)
     VALUES (?, 'food_record', ?, ?, 0, NULL)
     ON CONFLICT(entity_id) DO UPDATE SET operation=excluded.operation, queued_at=excluded.queued_at, last_error=NULL`,
    entityId,
    operation,
    queuedAt,
  );
}

export async function listRecords(database: SQLiteDatabase, includeDeleted = false): Promise<FoodRecord[]> {
  return database.getAllAsync<FoodRecord>(
    `SELECT * FROM food_records ${includeDeleted ? '' : 'WHERE deleted = 0'} ORDER BY date DESC, updated_at DESC`,
  );
}

export async function getRecord(database: SQLiteDatabase, id: string): Promise<FoodRecord | null> {
  return database.getFirstAsync<FoodRecord>('SELECT * FROM food_records WHERE id = ?', id);
}

export async function saveRecord(database: SQLiteDatabase, input: FoodRecordInput & { date: string; meal_category: MealCategory }, id?: string): Promise<string> {
  const timestamp = nowIso();
  const recordId = id ?? Crypto.randomUUID();
  const current = id ? await getRecord(database, id) : null;
  const date = new Date(`${input.date}T00:00:00Z`);
  const values = {
    date: input.date,
    year: input.year ?? date.getUTCFullYear(),
    month: input.month ?? date.getUTCMonth() + 1,
    day_of_week: input.day_of_week ?? (date.getUTCDay() + 6) % 7,
    day_name: input.day_name ?? date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
    meal_category: input.meal_category,
    menu_name: nullable(input.menu_name),
    hostel_capacity: nullable(input.hostel_capacity),
    residents_present: nullable(input.residents_present),
    advance_bookings: nullable(input.advance_bookings),
    weekend_flag: nullable(input.weekend_flag ?? (date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 1 : 0)),
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

export async function deleteRecord(database: SQLiteDatabase, id: string): Promise<void> {
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

export function savePrediction(database: SQLiteDatabase, meal: MealCategory, value: number, input: PredictionInput): Promise<unknown> {
  return database.runAsync(
    'INSERT INTO prediction_history(id, meal_category, predicted_waste_kg, input_json, model_name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    Crypto.randomUUID(), meal, value, JSON.stringify(input), 'food_waste_baseline.onnx', nowIso(),
  );
}

export function saveOptimization(database: SQLiteDatabase, input: OptimizationInput, result: OptimizationResult): Promise<unknown> {
  return database.runAsync(
    `INSERT INTO optimization_history(
      id, meal_category, expected_demand_kg, recommended_preparation_kg, predicted_waste_kg,
      estimated_shortage_kg, estimated_penalty_cost, input_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    Crypto.randomUUID(), input.meal_category, input.expected_demand_kg, result.recommended_preparation_kg,
    result.predicted_waste_kg, result.estimated_shortage_kg, result.estimated_penalty_cost,
    JSON.stringify(input), nowIso(),
  );
}

export async function listPredictions(database: SQLiteDatabase): Promise<PredictionHistory[]> {
  return database.getAllAsync<PredictionHistory>('SELECT * FROM prediction_history ORDER BY created_at DESC LIMIT 20');
}

export async function listOptimizations(database: SQLiteDatabase): Promise<OptimizationHistory[]> {
  return database.getAllAsync<OptimizationHistory>('SELECT * FROM optimization_history ORDER BY created_at DESC LIMIT 20');
}

export async function getPendingSyncCount(database: SQLiteDatabase): Promise<number> {
  const row = await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sync_queue');
  return row?.count ?? 0;
}

export async function resolveRecordConflict(database: SQLiteDatabase, id: string, choice: 'local' | 'server'): Promise<void> {
  const record = await getRecord(database, id);
  if (!record?.conflict_snapshot) throw new Error('This record no longer has a server conflict.');
  const remote = JSON.parse(record.conflict_snapshot) as Record<string, unknown>;
  const timestamp = nowIso();
  if (choice === 'local') {
    await database.withTransactionAsync(async () => {
      await database.runAsync(
        "UPDATE food_records SET server_id=?, sync_state='pending', base_snapshot=?, conflict_snapshot=NULL, updated_at=? WHERE id=?",
        Number(remote.id), JSON.stringify(remote), timestamp, id,
      );
      await queueRecord(database, id, 'upsert', timestamp);
    });
    return;
  }

  const fields = [
    'date', 'year', 'month', 'day_of_week', 'day_name', 'meal_category', 'menu_name', 'hostel_capacity',
    'residents_present', 'advance_bookings', 'weekend_flag', 'exam_flag', 'vacation_flag', 'festival_flag',
    'special_event_flag', 'temperature_c', 'rain_index', 'menu_popularity_score', 'student_turnout',
    'avg_consumed_per_student_kg', 'food_consumed_kg', 'food_prepared_kg', 'food_wasted_kg',
    'waste_percentage', 'estimated_waste_cost_inr',
  ] as const;
  await database.withTransactionAsync(async () => {
    const assignments = fields.map((field) => `${field}=?`).join(',');
    await database.runAsync(
      `UPDATE food_records SET ${assignments}, server_id=?, sync_state='synced', synced_at=?, updated_at=?, base_snapshot=?, conflict_snapshot=NULL WHERE id=?`,
      ...fields.map((field) => (remote[field] as string | number | null | undefined) ?? null),
      Number(remote.id), timestamp, timestamp, JSON.stringify(remote), id,
    );
    await database.runAsync('DELETE FROM sync_queue WHERE entity_id=?', id);
  });
}

export async function getAnalytics(database: SQLiteDatabase) {
  const records = (await listRecords(database)).filter((record) =>
    record.date != null
    && record.food_prepared_kg != null
    && record.food_consumed_kg != null
    && record.food_wasted_kg != null
    && record.estimated_waste_cost_inr != null,
  );
  const prepared = records.reduce((sum, item) => sum + Number(item.food_prepared_kg ?? 0), 0);
  const consumed = records.reduce((sum, item) => sum + Number(item.food_consumed_kg ?? 0), 0);
  const wasted = records.reduce((sum, item) => sum + Number(item.food_wasted_kg ?? 0), 0);
  const cost = records.reduce((sum, item) => sum + Number(item.estimated_waste_cost_inr ?? 0), 0);
  const byMeal = new Map<string, { meal_category: string; prepared_kg: number; consumed_kg: number; wasted_kg: number; records: number }>();
  const byDay = new Map<string, { period: string; prepared_kg: number; consumed_kg: number; wasted_kg: number; estimated_cost_inr: number }>();
  for (const record of records) {
    const meal = byMeal.get(record.meal_category) ?? { meal_category: record.meal_category, prepared_kg: 0, consumed_kg: 0, wasted_kg: 0, records: 0 };
    meal.prepared_kg += Number(record.food_prepared_kg ?? 0);
    meal.consumed_kg += Number(record.food_consumed_kg ?? 0);
    meal.wasted_kg += Number(record.food_wasted_kg ?? 0);
    meal.records += 1;
    byMeal.set(record.meal_category, meal);
    const day = byDay.get(record.date) ?? { period: record.date, prepared_kg: 0, consumed_kg: 0, wasted_kg: 0, estimated_cost_inr: 0 };
    day.prepared_kg += Number(record.food_prepared_kg ?? 0);
    day.consumed_kg += Number(record.food_consumed_kg ?? 0);
    day.wasted_kg += Number(record.food_wasted_kg ?? 0);
    day.estimated_cost_inr += Number(record.estimated_waste_cost_inr ?? 0);
    byDay.set(record.date, day);
  }
  return {
    total_records: records.length,
    total_prepared_kg: prepared,
    total_consumed_kg: consumed,
    total_wasted_kg: wasted,
    estimated_waste_cost_inr: cost,
    overall_waste_percentage: prepared ? wasted / prepared * 100 : 0,
    meal_categories: [...byMeal.values()].sort((a, b) => b.wasted_kg - a.wasted_kg),
    trends: [...byDay.values()].sort((a, b) => a.period.localeCompare(b.period)).map((item) => ({
      ...item,
      waste_percentage: item.prepared_kg ? item.wasted_kg / item.prepared_kg * 100 : 0,
    })),
  };
}

export async function exportBackupData(database: SQLiteDatabase) {
  const records = await listRecords(database, true);
  const predictions = await database.getAllAsync<PredictionHistory>('SELECT * FROM prediction_history ORDER BY created_at');
  const optimizations = await database.getAllAsync<OptimizationHistory>('SELECT * FROM optimization_history ORDER BY created_at');
  return { app: 'FoodWise', schemaVersion: 1, exportedAt: nowIso(), records, predictions, optimizations };
}

export async function restoreBackupData(database: SQLiteDatabase, payload: unknown): Promise<number> {
  if (!payload || typeof payload !== 'object') throw new Error('Backup file is not a FoodWise data export.');
  const backup = payload as { app?: string; schemaVersion?: number; records?: FoodRecord[]; predictions?: PredictionHistory[]; optimizations?: OptimizationHistory[] };
  if (backup.app !== 'FoodWise' || backup.schemaVersion !== 1 || !Array.isArray(backup.records) || !Array.isArray(backup.predictions) || !Array.isArray(backup.optimizations)) {
    throw new Error('Backup format or schema version is not supported.');
  }
  const allowedColumns = new Set<string>(RECORD_COLUMNS);
  const recordIds = new Set<string>();
  const externalIds = new Set<string>();
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
    if (!['local', 'pending', 'synced', 'conflict', 'pending-delete'].includes(record.sync_state)) {
      throw new Error('Backup contains an unsupported synchronization state. No data was changed.');
    }
  }

  await database.withTransactionAsync(async () => {
    await database.execAsync('DELETE FROM sync_queue; DELETE FROM food_records; DELETE FROM prediction_history; DELETE FROM optimization_history;');
    for (const record of backup.records ?? []) {
      const columns = RECORD_COLUMNS.filter((column) => column in record) as Array<keyof FoodRecord>;
      const placeholders = columns.map(() => '?').join(',');
      await database.runAsync(
        `INSERT INTO food_records(${columns.join(',')}) VALUES (${placeholders})`,
        ...columns.map((column) => record[column] as string | number | null),
      );
      if (record.sync_state !== 'synced') await queueRecord(database, record.id, record.deleted ? 'delete' : 'upsert', nowIso());
    }
    for (const item of backup.predictions ?? []) {
      await database.runAsync('INSERT INTO prediction_history(id, meal_category, predicted_waste_kg, input_json, model_name, created_at) VALUES (?, ?, ?, ?, ?, ?)', item.id, item.meal_category, item.predicted_waste_kg, item.input_json, item.model_name, item.created_at);
    }
    for (const item of backup.optimizations ?? []) {
      await database.runAsync('INSERT INTO optimization_history(id, meal_category, expected_demand_kg, recommended_preparation_kg, predicted_waste_kg, estimated_shortage_kg, estimated_penalty_cost, input_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', item.id, item.meal_category, item.expected_demand_kg, item.recommended_preparation_kg, item.predicted_waste_kg, item.estimated_shortage_kg, item.estimated_penalty_cost, item.input_json, item.created_at);
    }
  });
  return backup.records.length;
}
