import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Config } from '../src/types.js'

// All vi.mock factories must be self-contained — no external const/let references
// (vi.mock is hoisted to the top of the file).

vi.mock('../src/db/index.js', () => ({
  getDb:    () => ({}),
  backupDb: vi.fn(),
}))

vi.mock('../src/config.js', () => ({
  loadConfig: (): Config => ({
    stamp_enabled: true, preserve_enabled: true, preserve_whitelist: [],
    preserve_max_bytes: 104_857_600, preserve_max_files: 10_000,
    scheduler_interval_minutes: 30, calendar_timeout_ms: 10_000,
    retry_max_attempts: 20, log_file: '/tmp/test.log',
    calendars: ['https://alice.btc.calendar.opentimestamps.org'],
  }),
  getDataDir: () => '/tmp/test',
}))

vi.mock('../src/tools/create-timestamp.js',  () => ({ createTimestamp:  vi.fn() }))
vi.mock('../src/tools/upgrade-timestamp.js', () => ({ upgradeTimestamp: vi.fn() }))
vi.mock('../src/tools/verify-timestamp.js',  () => ({ verifyTimestamp:  vi.fn() }))
vi.mock('../src/tools/list-pending.js',      () => ({ listPending:      vi.fn() }))
vi.mock('../src/scheduler/index.js',         () => ({ runScheduler:     vi.fn() }))

import { runCli } from '../src/cli.js'
import { backupDb } from '../src/db/index.js'
import { createTimestamp }  from '../src/tools/create-timestamp.js'
import { upgradeTimestamp } from '../src/tools/upgrade-timestamp.js'
import { verifyTimestamp }  from '../src/tools/verify-timestamp.js'
import { listPending }      from '../src/tools/list-pending.js'
import { runScheduler }     from '../src/scheduler/index.js'

const HASH = 'a'.repeat(64)

let stdoutChunks: string[]
let stderrChunks: string[]

beforeEach(() => {
  stdoutChunks = []
  stderrChunks = []
  vi.spyOn(process.stdout, 'write').mockImplementation((s) => { stdoutChunks.push(String(s)); return true })
  vi.spyOn(process.stderr, 'write').mockImplementation((s) => { stderrChunks.push(String(s)); return true })
  vi.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`exit:${code}`) })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('runCli — stamp', () => {
  it('exits 1 with usage message when no hash is provided', async () => {
    await expect(runCli('stamp', [])).rejects.toThrow('exit:1')
    expect(stderrChunks.join('')).toContain('Usage')
  })

  it('calls createTimestamp and prints JSON on success', async () => {
    vi.mocked(createTimestamp).mockResolvedValue({ status: 'pending', id: 'x', hash: HASH, calendars: [], created_at: '' })
    await runCli('stamp', [HASH])
    expect(createTimestamp).toHaveBeenCalledWith({ hash: HASH }, {}, expect.any(Object))
    expect(stdoutChunks.join('')).toContain('"status"')
  })

  it('writes error to stderr and exits 1 when the tool returns an error result', async () => {
    vi.mocked(createTimestamp).mockResolvedValue({ error: 'calendar_error', details: 'oops' })
    await expect(runCli('stamp', [HASH])).rejects.toThrow('exit:1')
    expect(stderrChunks.join('')).toContain('calendar_error')
  })
})

describe('runCli — upgrade', () => {
  it('exits 1 when no id is provided', async () => {
    await expect(runCli('upgrade', [])).rejects.toThrow('exit:1')
  })

  it('calls upgradeTimestamp and prints JSON result', async () => {
    vi.mocked(upgradeTimestamp).mockResolvedValue({ status: 'confirmed', id: 'u1' } as any)
    await runCli('upgrade', ['u1'])
    expect(upgradeTimestamp).toHaveBeenCalledWith({ id: 'u1' }, {}, expect.any(Object))
    expect(stdoutChunks.join('')).toContain('"status"')
  })
})

describe('runCli — verify', () => {
  it('exits 1 when no id is provided', async () => {
    await expect(runCli('verify', [])).rejects.toThrow('exit:1')
  })

  it('calls verifyTimestamp and prints JSON result', async () => {
    vi.mocked(verifyTimestamp).mockResolvedValue({ status: 'pending', hash: HASH, calendars: [] })
    await runCli('verify', ['v1'])
    expect(verifyTimestamp).toHaveBeenCalledWith({ id: 'v1' }, {}, expect.any(Object))
    expect(stdoutChunks.join('')).toContain('"status"')
  })
})

describe('runCli — list', () => {
  it('calls listPending with the given status and prints JSON', async () => {
    vi.mocked(listPending).mockReturnValue({ items: [], total: 0 })
    await runCli('list', ['confirmed'])
    expect(listPending).toHaveBeenCalledWith({ status: 'confirmed' }, {}, expect.any(Object))
    expect(stdoutChunks.join('')).toContain('"items"')
  })

  it('defaults to "pending" status when no argument is given', async () => {
    vi.mocked(listPending).mockReturnValue({ items: [], total: 0 })
    await runCli('list', [])
    expect(listPending).toHaveBeenCalledWith({ status: 'pending' }, {}, expect.any(Object))
  })
})

describe('runCli — check-pending', () => {
  it('upgrades each pending due stamp and exits 0', async () => {
    vi.mocked(listPending).mockReturnValue({ items: [{ id: 'cp-1' }, { id: 'cp-2' }] as any, total: 2 })
    vi.mocked(upgradeTimestamp).mockResolvedValue({ status: 'confirmed' } as any)

    await expect(runCli('check-pending', [])).rejects.toThrow('exit:0')

    expect(upgradeTimestamp).toHaveBeenCalledTimes(2)
    expect(stderrChunks.join('')).toContain('Processing 2')
  })
})

describe('runCli — scheduler', () => {
  it('delegates to runScheduler with remaining args', async () => {
    vi.mocked(runScheduler).mockResolvedValue(undefined)
    await runCli('scheduler', ['status'])
    expect(runScheduler).toHaveBeenCalledWith(['status'])
  })
})

describe('runCli — backup', () => {
  it('calls backupDb with the given destination', async () => {
    await runCli('backup', ['my-backup.sqlite'])
    expect(backupDb).toHaveBeenCalledWith('my-backup.sqlite')
    expect(stdoutChunks.join('')).toContain('my-backup.sqlite')
  })

  it('generates a timestamped filename when no destination is given', async () => {
    await runCli('backup', [])
    expect(backupDb).toHaveBeenCalledWith(expect.stringContaining('ots-mcp-backup'))
  })
})
