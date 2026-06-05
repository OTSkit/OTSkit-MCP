import { describe, it, expect } from 'vitest'
import { makeRawDb } from '../helpers/db.js'
import { initDb } from '../../src/db/schema.js'

describe('initDb', () => {
  it('creates stamps and operations_log tables', () => {
    const db = makeRawDb()
    initDb(db)
    const tables = db.all(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    ) as { name: string }[]
    expect(tables.map(t => t.name)).toContain('stamps')
    expect(tables.map(t => t.name)).toContain('operations_log')
  })

  it('sets user_version to 1', () => {
    const db = makeRawDb()
    initDb(db)
    const row = db.get('PRAGMA user_version') as { user_version: number }
    expect(row.user_version).toBe(1)
  })

  it('is idempotent — calling twice does not error', () => {
    const db = makeRawDb()
    initDb(db)
    expect(() => initDb(db)).not.toThrow()
  })
})
