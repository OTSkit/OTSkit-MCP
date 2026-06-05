import type { DatabaseLike } from './driver.js'

export const CURRENT_VERSION = 1

export function initDb(db: DatabaseLike): void {
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec('PRAGMA foreign_keys = ON')
  runMigrations(db)
}

function runMigrations(db: DatabaseLike): void {
  const row = db.get('PRAGMA user_version') as { user_version: number }
  if (row.user_version < 1) migrateTo1(db)
}

function migrateTo1(db: DatabaseLike): void {
  db.exec('BEGIN')
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS stamps (
        id              TEXT PRIMARY KEY,
        hash            TEXT NOT NULL,
        status          TEXT NOT NULL,
        created_at      TEXT NOT NULL,
        confirmed_at    TEXT,
        bitcoin_block   INTEGER,
        bitcoin_time    TEXT,
        proof_path      TEXT,
        archive_path    TEXT,
        last_attempt_at TEXT,
        attempt_count   INTEGER NOT NULL DEFAULT 0,
        last_error      TEXT,
        next_retry_at   TEXT,
        metadata        TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_stamps_hash   ON stamps(hash);
      CREATE INDEX IF NOT EXISTS idx_stamps_status ON stamps(status);

      CREATE TABLE IF NOT EXISTS operations_log (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        stamp_id         TEXT NOT NULL REFERENCES stamps(id),
        action           TEXT NOT NULL,
        result           TEXT NOT NULL,
        error_msg        TEXT,
        calendar_uri     TEXT,
        response_time_ms INTEGER,
        created_at       TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_oplog_stamp_id ON operations_log(stamp_id);
      CREATE INDEX IF NOT EXISTS idx_oplog_created  ON operations_log(created_at);
    `)
    db.exec('PRAGMA user_version = 1')
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}
