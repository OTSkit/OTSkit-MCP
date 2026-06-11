import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Each test uses a fresh data dir so the singleton is fully isolated
let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ots-db-index-'))
  process.env.OTS_MCP_DATA_DIR = tmpDir
})

afterEach(async () => {
  // Reset the singleton between tests
  const { resetDbForTests } = await import('../../src/db/index.js')
  resetDbForTests()
  delete process.env.OTS_MCP_DATA_DIR
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('getDb', () => {
  it('creates the data directory and returns a working DatabaseLike instance', async () => {
    const { getDb } = await import('../../src/db/index.js')
    const db = getDb()
    expect(db).toBeDefined()
    expect(existsSync(join(tmpDir, 'db.sqlite'))).toBe(true)
  })

  it('returns the same singleton on repeated calls', async () => {
    const { getDb } = await import('../../src/db/index.js')
    const db1 = getDb()
    const db2 = getDb()
    expect(db1).toBe(db2)
  })
})

describe('resetDbForTests', () => {
  it('clears the singleton so the next getDb() opens a new connection', async () => {
    const { getDb, resetDbForTests } = await import('../../src/db/index.js')
    const db1 = getDb()
    resetDbForTests()
    const db2 = getDb()
    // After reset a new instance is created — not the same reference
    expect(db2).not.toBe(db1)
  })
})

describe('backupDb', () => {
  it('creates a valid SQLite backup file at the given path', async () => {
    const { getDb, backupDb } = await import('../../src/db/index.js')
    getDb() // ensure the primary DB exists
    const dest = join(tmpDir, 'backup.sqlite')
    backupDb(dest)
    expect(existsSync(dest)).toBe(true)
  })
})
