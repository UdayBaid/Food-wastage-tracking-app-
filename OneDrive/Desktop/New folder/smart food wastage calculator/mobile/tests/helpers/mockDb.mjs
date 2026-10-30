import { DatabaseSync } from 'node:sqlite';

/**
 * Creates an in-memory database adapter compatible with Expo SQLiteDatabase API
 */
export function createMockExpoDatabase() {
  const db = new DatabaseSync(':memory:');

  return {
    raw: db,
    async execAsync(sql) {
      db.exec(sql);
    },
    async getFirstAsync(sql, ...params) {
      const stmt = db.prepare(sql);
      const row = stmt.get(...params);
      return row ? { ...row } : null;
    },
    async getAllAsync(sql, ...params) {
      const stmt = db.prepare(sql);
      return stmt.all(...params).map((row) => ({ ...row }));
    },
    async runAsync(sql, ...params) {
      const stmt = db.prepare(sql);
      const res = stmt.run(...params);
      return {
        lastInsertRowId: Number(res.lastInsertRowid),
        changes: res.changes,
      };
    },
    async withTransactionAsync(fn) {
      db.exec('BEGIN TRANSACTION;');
      try {
        const result = await fn();
        db.exec('COMMIT;');
        return result;
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }
    },
  };
}

