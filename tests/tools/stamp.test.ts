import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { initDb } from '../../src/db/schema.js'
import { createTimestamp } from '../../src/tools/create-timestamp.js'
import type { Config } from '../../src/types.js'

vi.mock('@otskit/client', () => ({
  OpenTimestampsClient: vi.fn().mockImplementation(() => ({
    stamp: vi.fn().mockResolvedValue(Buffer.from([1, 2, 3])),
  })),
}))

const MOCK_CONFIG: Config = {
  stamp_enabled: true, preserve_enabled: true, preserve_whitelist: [],
  preserve_max_bytes: 104_857_600, preserve_max_files: 10_000,
  scheduler_interval_minutes: 30, calendar_timeout_ms: 10_000,
  calendar_max_response_bytes: 1_048_576, retry_max_attempts: 20,
  log_file: '/tmp/test.log',
  calendars: ['https://alice.btc.calendar.opentimestamps.org'],
  esplora_url: 'https://blockstream.info/api',
}

let db: ReturnType<typeof Database>

beforeEach(() => {
  process.env.OTS_MCP_DATA_DIR = `/tmp/ots-stamp-test-${Date.now()}`
  mkdirSync(process.env.OTS_MCP_DATA_DIR + '/proofs', { recursive: true })
  db = new Database(':memory:')
  initDb(db)
})
afterEach(() => { delete process.env.OTS_MCP_DATA_DIR })

describe('stamp', () => {
  it('returns invalid_hash for non-hex input', async () => {
    const result = await createTimestamp({ hash: 'notahash' }, db, MOCK_CONFIG)
    expect(result).toMatchObject({ error: 'invalid_hash' })
  })

  it('returns invalid_hash for 63-char hex', async () => {
    const result = await createTimestamp({ hash: 'a'.repeat(63) }, db, MOCK_CONFIG)
    expect(result).toMatchObject({ error: 'invalid_hash' })
  })

  it('returns pending record on success', async () => {
    const result = await createTimestamp({ hash: 'a'.repeat(64) }, db, MOCK_CONFIG)
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.status).toBe('pending')
      expect(result.hash).toBe('a'.repeat(64))
      expect(result.id).toBeTruthy()
    }
  })
})
