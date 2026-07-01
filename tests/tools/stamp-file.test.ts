import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { makeRawDb } from '../helpers/db.js'
import type { DatabaseLike } from '../../src/db/driver.js'
import { initDb } from '../../src/db/schema.js'
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

import { stampFile } from '../../src/tools/stamp-file.js'
import { OpenTimestampsClient } from '@otskit/client'

let tmpDir: string
let db: DatabaseLike

const MOCK_CONFIG: Config = {
  stamp_enabled: true, preserve_enabled: true, preserve_whitelist: [],
  preserve_max_bytes: 104_857_600, preserve_max_files: 10_000,
  scheduler_interval_minutes: 30, calendar_timeout_ms: 10_000,
  retry_max_attempts: 20, log_file: '/tmp/test.log',
  calendars: ['https://alice.btc.calendar.opentimestamps.org'],
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ots-stamp-file-'))
  process.env.OTS_MCP_DATA_DIR = tmpDir
  mkdirSync(join(tmpDir, 'proofs'), { recursive: true })
  db = makeRawDb()
  initDb(db)
  vi.mocked(OpenTimestampsClient).mockImplementation(function() {
    return {
      stamp: vi.fn().mockResolvedValue(Buffer.from([1, 2, 3])),
      verify: vi.fn(),
    }
  })
})

afterEach(() => {
  delete process.env.OTS_MCP_DATA_DIR
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('stampFile', () => {
  it('returns invalid_path for a nonexistent file path', async () => {
    const result = await stampFile({ path: join(tmpDir, 'does-not-exist.txt') }, db, MOCK_CONFIG)
    expect(result).toMatchObject({ error: 'invalid_path' })
  })

  it('returns not_a_regular_file when path points to a directory', async () => {
    const result = await stampFile({ path: tmpDir }, db, MOCK_CONFIG)
    expect(result).toMatchObject({ error: 'not_a_regular_file' })
  })

  it('returns path_not_allowed when file is outside the configured whitelist', async () => {
    const file = join(tmpDir, 'test.txt')
    writeFileSync(file, 'hello')
    const config = { ...MOCK_CONFIG, preserve_whitelist: ['/some/other/dir'] }
    const result = await stampFile({ path: file }, db, config)
    expect(result).toMatchObject({ error: 'path_not_allowed' })
  })

  it('stamps a valid file and returns a pending record', async () => {
    const file = join(tmpDir, 'content.txt')
    writeFileSync(file, 'hello world')
    const result = await stampFile({ path: file }, db, MOCK_CONFIG)
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.status).toBe('pending')
      expect(typeof result.id).toBe('string')
    }
  })

  it('returns file_too_large when file exceeds preserve_max_bytes', async () => {
    const file = join(tmpDir, 'big.txt')
    writeFileSync(file, 'x'.repeat(100))
    const config = { ...MOCK_CONFIG, preserve_max_bytes: 10 }
    const result = await stampFile({ path: file }, db, config)
    expect(result).toMatchObject({ error: 'file_too_large' })
  })

  it('returns calendar_error when the OTS client stamp() rejects', async () => {
    vi.mocked(OpenTimestampsClient).mockImplementation(function() {
      return {
        stamp: vi.fn().mockRejectedValue(new Error('calendar unreachable')),
        verify: vi.fn(),
      }
    })
    const file = join(tmpDir, 'err.txt')
    writeFileSync(file, 'data')
    const result = await stampFile({ path: file }, db, MOCK_CONFIG)
    expect(result).toMatchObject({ error: 'calendar_error' })
  })
})
