import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdirSync, writeFileSync } from 'fs'
import { initDb } from '../../src/db/schema.js'
import { preserve } from '../../src/tools/preserve.js'
import type { Config } from '../../src/types.js'

vi.mock('../../src/tools/stamp.js', () => ({
  stamp: vi.fn().mockResolvedValue({
    id: 'mock-id', hash: 'a'.repeat(64), status: 'pending',
    calendars: [], created_at: new Date().toISOString(), proof_path: '/tmp/mock.ots',
  }),
}))

const makeConfig = (whitelist: string[]): Config => ({
  stamp_enabled: true, preserve_enabled: true,
  preserve_whitelist: whitelist,
  preserve_max_bytes: 104_857_600, preserve_max_files: 10_000,
  scheduler_interval_minutes: 30, calendar_timeout_ms: 10_000,
  calendar_max_response_bytes: 1_048_576, retry_max_attempts: 20,
  log_file: '/tmp/test.log', calendars: [], esplora_url: 'https://blockstream.info/api',
})

let db: ReturnType<typeof Database>

beforeEach(() => {
  process.env.OTS_MCP_DATA_DIR = `/tmp/ots-preserve-test-${Date.now()}`
  mkdirSync(process.env.OTS_MCP_DATA_DIR!, { recursive: true })
  db = new Database(':memory:')
  initDb(db)
})
afterEach(() => { delete process.env.OTS_MCP_DATA_DIR })

describe('preserve — security', () => {
  it('error whitelist_not_configured when whitelist empty', async () => {
    const result = await preserve({ dir_path: '/tmp' }, db, makeConfig([]))
    expect(result).toMatchObject({ error: 'whitelist_not_configured' })
  })

  it('error path_not_in_whitelist for dir outside whitelist', async () => {
    const dir = process.env.OTS_MCP_DATA_DIR!
    const result = await preserve({ dir_path: '/etc' }, db, makeConfig([dir]))
    expect(result).toMatchObject({ error: 'path_not_in_whitelist' })
  })

  it('rejects path traversal', async () => {
    const dir = process.env.OTS_MCP_DATA_DIR!
    const result = await preserve({ dir_path: `${dir}/../etc` }, db, makeConfig([dir]))
    expect(result).toMatchObject({ error: 'path_not_in_whitelist' })
  })

  it('rejects non-directory path', async () => {
    const dir = process.env.OTS_MCP_DATA_DIR!
    const filePath = dir + '/notadir.txt'
    writeFileSync(filePath, 'hello')
    const result = await preserve({ dir_path: filePath }, db, makeConfig([dir]))
    expect(result).toMatchObject({ error: 'path_not_in_whitelist' })
  })
})
