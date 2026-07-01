import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeRawDb } from '../helpers/db.js'
import type { DatabaseLike } from '../../src/db/driver.js'
import { mkdirSync } from 'fs'
import { initDb } from '../../src/db/schema.js'
import { createTimestamp } from '../../src/tools/create-timestamp.js'
import type { Config } from '../../src/types.js'

vi.mock('@otskit/client', () => ({
  OpenTimestampsClient: vi.fn().mockImplementation(function() {
    return {
      stamp: vi.fn().mockResolvedValue(Buffer.from([1, 2, 3])),
    }
  }),
  DEFAULT_CALENDARS: [
    'https://alice.btc.calendar.opentimestamps.org',
    'https://bob.btc.calendar.opentimestamps.org',
    'https://finney.calendar.eternitywall.com',
    'https://btc.calendar.catallaxy.com',
  ],
}))

// Wrap writeAtomic so individual tests can override it via mockImplementationOnce.
vi.mock('../../src/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils.js')>()
  return { ...actual, writeAtomic: vi.fn(actual.writeAtomic) }
})

import { writeAtomic } from '../../src/utils.js'

const MOCK_CONFIG: Config = {
  stamp_enabled: true, preserve_enabled: true, preserve_whitelist: [],
  preserve_max_bytes: 104_857_600, preserve_max_files: 10_000,
  scheduler_interval_minutes: 30, calendar_timeout_ms: 10_000,
  retry_max_attempts: 20,
  log_file: '/tmp/test.log',
  calendars: ['https://alice.btc.calendar.opentimestamps.org'],
}

let db: DatabaseLike

beforeEach(() => {
  process.env.OTS_MCP_DATA_DIR = `/tmp/ots-stamp-test-${Date.now()}`
  mkdirSync(process.env.OTS_MCP_DATA_DIR + '/proofs', { recursive: true })
  db = makeRawDb()
  initDb(db)
})

afterEach(() => {
  delete process.env.OTS_MCP_DATA_DIR
  vi.clearAllMocks()
})

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

  it('writes the stamp and its operation log atomically', async () => {
    const result = await createTimestamp({ hash: 'b'.repeat(64) }, db, MOCK_CONFIG)
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      const logs = db.all('SELECT * FROM operations_log WHERE stamp_id = ?', [result.id])
      const stamps = db.all('SELECT * FROM stamps WHERE id = ?', [result.id])
      expect(stamps).toHaveLength(1)
      expect(logs).toHaveLength(1)
    }
  })

  it('returns calendar_error when the OTS client stamp() rejects', async () => {
    const { OpenTimestampsClient } = await import('@otskit/client')
    vi.mocked(OpenTimestampsClient).mockImplementationOnce(function() {
      return {
        stamp: vi.fn().mockRejectedValue(new Error('calendar unreachable')),
        verify: vi.fn(),
      }
    })
    const result = await createTimestamp({ hash: 'c'.repeat(64) }, db, MOCK_CONFIG)
    expect(result).toMatchObject({ error: 'calendar_error' })
    expect((result as any).details).toContain('calendar unreachable')
  })

  it('returns storage_error and rolls back when writeAtomic throws', async () => {
    vi.mocked(writeAtomic).mockImplementationOnce(() => { throw new Error('disk full') })

    const result = await createTimestamp({ hash: 'd'.repeat(64) }, db, MOCK_CONFIG)
    expect(result).toMatchObject({ error: 'storage_error' })
    // The DB transaction must be rolled back — no stamp should be inserted
    const rows = db.all('SELECT * FROM stamps WHERE hash = ?', ['d'.repeat(64)])
    expect(rows).toHaveLength(0)
  })
})
