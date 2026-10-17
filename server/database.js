import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

export const databasePath = fileURLToPath(new URL('../public/data/policies.sqlite', import.meta.url));

export function openDatabase() {
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  // 使用单文件日志模式，提交后只需将 policies.sqlite 推送到仓库。
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = DELETE;
    CREATE TABLE IF NOT EXISTS cities (
      name TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      synced_at TEXT,
      last_error TEXT
    );
    CREATE TABLE IF NOT EXISTS policies (
      city_name TEXT PRIMARY KEY REFERENCES cities(name),
      source_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      effective_at INTEGER NOT NULL,
      source_updated_at INTEGER NOT NULL,
      synced_at TEXT NOT NULL,
      policy_json TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );
    PRAGMA user_version = 1;
  `);
  return db;
}

export function createPolicyRepository(db) {
  return {
    listCities() {
      return db.prepare('SELECT * FROM cities ORDER BY name').all();
    },
    addCity(name) {
      db.prepare('INSERT OR IGNORE INTO cities(name, created_at) VALUES (?, ?)')
        .run(name, new Date().toISOString());
    },
    savePolicy(city, policy, raw) {
      const syncedAt = new Date().toISOString();
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(`INSERT INTO policies VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(city_name) DO UPDATE SET
            source_id=excluded.source_id, display_name=excluded.display_name,
            effective_at=excluded.effective_at, source_updated_at=excluded.source_updated_at,
            synced_at=excluded.synced_at, policy_json=excluded.policy_json, raw_json=excluded.raw_json`)
          .run(city, policy.id, policy.name, policy.effectiveAt, policy.updatedAt,
            syncedAt, JSON.stringify(policy), JSON.stringify(raw));
        db.prepare('UPDATE cities SET synced_at=?, last_error=NULL WHERE name=?').run(syncedAt, city);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    saveError(city, message) {
      // 同步失败保留上一次成功的政策，不用错误响应覆盖已有数据。
      db.prepare('UPDATE cities SET last_error=? WHERE name=?').run(message, city);
    },
  };
}
