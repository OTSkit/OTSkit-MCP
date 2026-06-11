import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeRawDb } from '../helpers/db.js'
import type { DatabaseLike } from '../../src/db/driver.js'
import { initDb } from '../../src/db/schema.js'
import { insertStamp } from '../../src/db/stamps.js'
import type { Config } from '../../src/types.js'

const MOCK_CONFIG: Config = {
  stamp_enabled: true, preserve_enabled: true, preserve_whitelist: [],
  preserve_max_bytes: 104_857_600, preserve_max_files: 10_000,
  scheduler_interval_minutes: 30, calendar_timeout_ms: 10_000,
  retry_max_attempts: 20, log_file: '/tmp/test.log',
  calendars: ['https://alice.btc.calendar.opentimestamps.org'],
}

let mockDb: DatabaseLike

vi.mock('../../src/db/index.js', () => ({
  getDb: () => mockDb,
  resetDbForTests: vi.fn(),
}))

vi.mock('../../src/config.js', () => ({
  loadConfig: () => MOCK_CONFIG,
  getDataDir: () => '/tmp/ots-watch-test',
}))

vi.mock('../../src/tools/upgrade-timestamp.js', () => ({
  upgradeTimestamp: vi.fn().mockResolvedValue({ status: 'confirmed' }),
}))

import { normalizeWatchInterval, watchPending } from '../../src/tools/watch.js'
import { upgradeTimestamp } from '../../src/tools/upgrade-timestamp.js'

describe('normalizeWatchInterval', () => {
  it('returns 30 by default', () => {
    expect(normalizeWatchInterval()).toBe(30)
  })

  it('returns 30 for NaN and Infinity', () => {
    expect(normalizeWatchInterval(NaN)).toBe(30)
    expect(normalizeWatchInterval(Infinity)).toBe(30)
  })

  it('clamps values below minimum to 15', () => {
    expect(normalizeWatchInterval(0)).toBe(15)
    expect(normalizeWatchInterval(5)).toBe(15)
    expect(normalizeWatchInterval(14)).toBe(15)
  })

  it('floors fractional values', () => {
    expect(normalizeWatchInterval(45.9)).toBe(45)
    expect(normalizeWatchInterval(30.1)).toBe(30)
  })

  it('passes valid integers through unchanged', () => {
    expect(normalizeWatchInterval(15)).toBe(15)
    expect(normalizeWatchInterval(60)).toBe(60)
    expect(normalizeWatchInterval(1440)).toBe(1440)
  })
})

describe('watchPending', () => {
  beforeEach(() => {
    mockDb = makeRawDb()
    initDb(mockDb)
    vi.mocked(upgradeTimestamp).mockResolvedValue({ status: 'confirmed' })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('prints startup message and no-pending note with empty DB', async () => {
    const chunks: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((s) => { chunks.push(String(s)); return true })

    await watchPending(15)

    const out = chunks.join('')
    expect(out).toContain('Watching pending stamps')
    expect(out).toContain('(no pending stamps)')
  })

  it('upgrades due stamps (next_retry_at IS NULL) and reports their status', async () => {
    insertStamp(mockDb, { id: 'due-stamp', hash: 'a'.repeat(64), proof_path: '/tmp/a.ots' })

    const chunks: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((s) => { chunks.push(String(s)); return true })

    await watchPending(15)

    expect(upgradeTimestamp).toHaveBeenCalledWith({ id: 'due-stamp' }, mockDb, MOCK_CONFIG)
    expect(chunks.join('')).toContain('upgrading 1 due stamp')
  })

  it('catches tick errors and writes them to stderr without crashing', async () => {
    vi.spyOn(mockDb, 'all').mockImplementationOnce(() => { throw new Error('db boom') })

    const errs: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((s) => { errs.push(String(s)); return true })

    await expect(watchPending(15)).resolves.toBeUndefined()
    expect(errs.join('')).toContain('watch error')
    expect(errs.join('')).toContain('db boom')
  })
})
