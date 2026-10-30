import axios from 'axios';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { FoodRecord } from '../domain/types';
import { api } from './api';

interface QueueItem {
  entity_id: string;
  operation: 'upsert' | 'delete';
  attempts: number;
}

const SERVER_FIELDS = [
  'record_id', 'date', 'year', 'month', 'day_of_week', 'day_name', 'meal_category', 'menu_name',
  'hostel_capacity', 'residents_present', 'advance_bookings', 'weekend_flag', 'exam_flag', 'vacation_flag',
  'festival_flag', 'special_event_flag', 'temperature_c', 'rain_index', 'menu_popularity_score', 'student_turnout',
  'avg_consumed_per_student_kg', 'food_consumed_kg', 'food_prepared_kg', 'food_wasted_kg', 'waste_percentage',
  'estimated_waste_cost_inr',
] as const;

function serverPayload(record: FoodRecord) {
  return Object.fromEntries(SERVER_FIELDS.map((field) => [field, record[field]]));
}

function sameServerSnapshot(snapshotJson: string | null, server: Record<string, unknown>): boolean {
  if (!snapshotJson) return false;
  let snapshot: Record<string, unknown>;
  try { snapshot = JSON.parse(snapshotJson) as Record<string, unknown>; }
  catch { return false; }
  const fields = SERVER_FIELDS;
  return fields.every((field) => {
    const localValue = snapshot[field];
    const remoteValue = server[field];
    if (localValue == null && remoteValue == null) return true;
    if (typeof localValue === 'number' && typeof remoteValue === 'number') return Math.abs(localValue - remoteValue) < 1e-8;
    return String(localValue ?? '') === String(remoteValue ?? '');
  });
}

async function findServerRecord(recordId: string): Promise<Record<string, unknown> | null> {
  const limit = 1000;
  const first = await api.get('/records', { params: { skip: 0, limit } });
  const total = Number(first.data.total ?? 0);
  const pages = [first.data.records as Array<Record<string, unknown>>];
  for (let skip = limit; skip < total; skip += limit) {
    const response = await api.get('/records', { params: { skip, limit } });
    pages.push(response.data.records as Array<Record<string, unknown>>);
  }
  return pages.flat().find((record) => record.record_id === recordId) ?? null;
}

async function markConflict(database: SQLiteDatabase, record: FoodRecord, remote: Record<string, unknown>) {
  await database.runAsync(
    "UPDATE food_records SET sync_state='conflict', conflict_snapshot=? WHERE id=?",
    JSON.stringify(remote), record.id,
  );
  await database.runAsync("UPDATE sync_queue SET last_error='Remote record changed; resolve conflict locally.' WHERE entity_id=?", record.id);
}

export async function syncPendingRecords(database: SQLiteDatabase): Promise<{ synced: number; conflicts: number }> {
  const queue = await database.getAllAsync<QueueItem>(
    "SELECT entity_id, operation, attempts FROM sync_queue WHERE entity_type='food_record' ORDER BY queued_at",
  );
  let synced = 0;
  let conflicts = 0;

  for (const item of queue) {
    const record = await database.getFirstAsync<FoodRecord>('SELECT * FROM food_records WHERE id=?', item.entity_id);
    if (!record) {
      await database.runAsync('DELETE FROM sync_queue WHERE entity_id=?', item.entity_id);
      continue;
    }

    try {
      if (item.operation === 'delete' || record.deleted) {
        if (record.server_id == null) {
          await database.runAsync('DELETE FROM food_records WHERE id=?', record.id);
        } else {
          try {
            const remoteResponse = await api.get(`/records/${record.server_id}`);
            const remote = remoteResponse.data as Record<string, unknown>;
            if (!sameServerSnapshot(record.base_snapshot, remote)) {
              await markConflict(database, record, remote);
              conflicts += 1;
              continue;
            }
            await api.delete(`/records/${record.server_id}`);
          } catch (error) {
            if (!axios.isAxiosError(error) || error.response?.status !== 404) throw error;
          }
          await database.runAsync('DELETE FROM food_records WHERE id=?', record.id);
        }
        await database.runAsync('DELETE FROM sync_queue WHERE entity_id=?', record.id);
        synced += 1;
        continue;
      }

      const payload = serverPayload(record);
      let responseData: Record<string, unknown>;
      if (record.server_id == null) {
        try {
          const response = await api.post('/records', payload);
          responseData = response.data;
        } catch (error) {
          if (!axios.isAxiosError(error) || error.response?.status !== 409) throw error;
          const existing = await findServerRecord(record.record_id);
          if (!existing) throw error;
          responseData = existing;
        }
      } else {
        const remoteResponse = await api.get(`/records/${record.server_id}`);
        const remote = remoteResponse.data as Record<string, unknown>;
        if (!sameServerSnapshot(record.base_snapshot, remote)) {
          await markConflict(database, record, remote);
          conflicts += 1;
          continue;
        }
        const { record_id: _recordId, ...updatePayload } = payload;
        const response = await api.patch(`/records/${record.server_id}`, updatePayload);
        responseData = response.data;
      }

      await database.withTransactionAsync(async () => {
        await database.runAsync(
          "UPDATE food_records SET server_id=?, sync_state='synced', synced_at=?, updated_at=?, base_snapshot=?, conflict_snapshot=NULL WHERE id=?",
          Number(responseData.id), new Date().toISOString(), new Date().toISOString(), JSON.stringify(responseData), record.id,
        );
        await database.runAsync('DELETE FROM sync_queue WHERE entity_id=?', record.id);
      });
      synced += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync request failed';
      await database.runAsync('UPDATE sync_queue SET attempts=attempts+1, last_error=? WHERE entity_id=?', message, record.id);
    }
  }

  return { synced, conflicts };
}
