import DatabaseConstructor, { type Database } from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync, statSync } from 'fs'
import { getDataDir } from '../config.js'
import { initDb } from './schema.js'

let _db: Database | null = null

export function getDb(): Database {
  if (_db) return _db
  const dir = getDataDir()
  mkdirSync(dir, { recursive: true })
  _db = new DatabaseConstructor(join(dir, 'db.sqlite'))
  initDb(_db)
  reconcileOrphans(_db)
  return _db
}

export function backupDb(destPath: string): void {
  getDb().backup(destPath)
}

function reconcileOrphans(db: Database): void {
  const pending = db.prepare(
    `SELECT id, proof_path FROM stamps WHERE status = 'pending' AND proof_path IS NOT NULL`
  ).all() as { id: string; proof_path: string }[]

  for (const row of pending) {
    try {
      statSync(row.proof_path)
    } catch {
      db.prepare(`UPDATE stamps SET status = 'failed', last_error = ? WHERE id = ?`)
        .run('proof file missing on disk', row.id)
    }
  }
}
