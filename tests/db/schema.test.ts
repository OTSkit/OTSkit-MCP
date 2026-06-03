import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { initDb } from '../../src/db/schema.js'

describe('initDb', () => {
  it('creates stamps and operations_log tables', () => {
    const db = new Database(':memory:')
    initDb(db)
    const tables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    ).all() as { name: string }[]
    expect(tables.map(t => t.name)).toContain('stamps')
    expect(tables.map(t => t.name)).toContain('operations_log')
  })

  it('sets user_version to 1', () => {
    const db = new Database(':memory:')
    initDb(db)
    expect(db.pragma('user_version', { simple: true })).toBe(1)
  })

  it('is idempotent — calling twice does not error', () => {
    const db = new Database(':memory:')
    initDb(db)
    expect(() => initDb(db)).not.toThrow()
  })
})
