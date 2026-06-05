import { createRequire } from 'module'
import { join } from 'path'
import { mkdirSync, statSync } from 'fs'
import { getDataDir } from '../config.js'
import { initDb } from './schema.js'
import type { DatabaseLike } from './driver.js'

let _db: DatabaseLike | null = null

export function getDb(): DatabaseLike {
  if (_db) return _db
  const _require = createRequire(import.meta.url)
  const { Database } = _require('node-sqlite3-wasm') as { Database: new (path: string) => DatabaseLike }
  const dir = getDataDir()
  mkdirSync(dir, { recursive: true })
  _db = new Database(join(dir, 'db.sqlite'))
  initDb(_db)
  reconcileOrphans(_db)
  return _db
}

export function resetDbForTests(): void {
  _db?.close()
  _db = null
}

export function backupDb(destPath: string): void {
  const escaped = destPath.replace(/'/g, "''")
  getDb().exec(`VACUUM INTO '${escaped}'`)
}

function reconcileOrphans(db: DatabaseLike): void {
  const pending = db.all(
    `SELECT id, proof_path FROM stamps WHERE status = 'pending' AND proof_path IS NOT NULL`
  ) as { id: string; proof_path: string }[]

  for (const row of pending) {
    try {
      statSync(row.proof_path)
    } catch {
      db.run(`UPDATE stamps SET status = 'failed', last_error = ? WHERE id = ?`,
        ['proof file missing on disk', row.id])
    }
  }
}
