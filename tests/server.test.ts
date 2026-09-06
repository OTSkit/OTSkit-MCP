import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Config } from '../src/types.js'
import { makeRawDb } from './helpers/db.js'
import { initDb } from '../src/db/schema.js'

// ── MCP SDK mocks ──────────────────────────────────────────────────────────────
const capturedHandlers: ((...args: any[]) => any)[] = []
const mockServer = {
  setRequestHandler: vi.fn((_schema: unknown, handler: (...args: any[]) => any) => {
    capturedHandlers.push(handler)
  }),
  connect: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn(function() { return mockServer }),
}))
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(function() { return {} }),
}))

// ── DB + config + feature-gate mocks ──────────────────────────────────────────
const db = makeRawDb()
initDb(db)

const MOCK_CONFIG: Config = {
  stamp_enabled: true, preserve_enabled: true, preserve_whitelist: [],
  preserve_max_bytes: 104_857_600, preserve_max_files: 10_000,
  scheduler_interval_minutes: 30, calendar_timeout_ms: 10_000,
  retry_max_attempts: 20, log_file: '/tmp/test.log',
  calendars: ['https://alice.btc.calendar.opentimestamps.org'],
}

const mockGetDb = vi.fn(() => db)
vi.mock('../src/db/index.js', () => ({ getDb: () => mockGetDb(), resetDbForTests: vi.fn() }))
vi.mock('../src/config.js', () => ({ loadConfig: () => MOCK_CONFIG, getDataDir: () => '/tmp/test' }))
vi.mock('../src/feature-gate.js', () => ({ featureDisabledError: vi.fn().mockReturnValue(null) }))

// ── Tool mocks ─────────────────────────────────────────────────────────────────
const mockCreate  = vi.fn()
const mockUpgrade = vi.fn()
const mockVerify  = vi.fn()
const mockVerifyExternal = vi.fn()
const mockInspect = vi.fn()
const mockList    = vi.fn()
const mockHash    = vi.fn()
const mockStamp   = vi.fn()
const mockWatch   = vi.fn()

vi.mock('../src/tools/create-timestamp.js',  () => ({ createTimestamp:  (...a: any[]) => mockCreate(...a)  }))
vi.mock('../src/tools/upgrade-timestamp.js', () => ({ upgradeTimestamp: (...a: any[]) => mockUpgrade(...a) }))
vi.mock('../src/tools/verify-timestamp.js',  () => ({ verifyTimestamp:  (...a: any[]) => mockVerify(...a)  }))
vi.mock('../src/tools/verify-external-proof.js', () => ({ verifyExternalProof: (...a: any[]) => mockVerifyExternal(...a) }))
vi.mock('../src/tools/inspect-timestamp.js', () => ({ inspectTimestamp: (...a: any[]) => mockInspect(...a) }))
vi.mock('../src/tools/list-pending.js',      () => ({ listPending:      (...a: any[]) => mockList(...a)    }))
vi.mock('../src/tools/hash-file.js',         () => ({ hashFileTool:     (...a: any[]) => mockHash(...a)    }))
vi.mock('../src/tools/stamp-file.js',        () => ({ stampFile:        (...a: any[]) => mockStamp(...a)   }))
vi.mock('../src/tools/watch-window.js',      () => ({ openWatchWindow:  (...a: any[]) => mockWatch(...a)   }))

import { runServer } from '../src/server.js'
import { featureDisabledError } from '../src/feature-gate.js'
import { TOOL_DEFINITIONS } from '../src/tool-definitions.js'

const HASH = 'a'.repeat(64)

// runServer once; capture handlers[0] = ListTools, handlers[1] = CallTool
let listToolsHandler: (...args: any[]) => any
let callToolHandler:  (...args: any[]) => any

beforeEach(async () => {
  capturedHandlers.length = 0
  vi.clearAllMocks()
  vi.mocked(featureDisabledError).mockReturnValue(null)
  await runServer()
  ;[listToolsHandler, callToolHandler] = capturedHandlers
})

afterEach(() => vi.restoreAllMocks())

describe('runServer — ListTools handler', () => {
  it('returns the full TOOL_DEFINITIONS list', async () => {
    const result = await listToolsHandler()
    expect(result.tools).toEqual(TOOL_DEFINITIONS)
  })
})

describe('runServer — CallTool dispatch', () => {
  it('routes create_timestamp to createTimestamp', async () => {
    mockCreate.mockResolvedValue({ status: 'pending', id: 'x', hash: HASH, calendars: [], created_at: '' })
    const res = await callToolHandler({ params: { name: 'create_timestamp', arguments: { hash: HASH } } })
    expect(mockCreate).toHaveBeenCalledWith({ hash: HASH }, db, MOCK_CONFIG)
    expect(res.isError).toBe(false)
  })

  it('routes list_pending to listPending', async () => {
    mockList.mockReturnValue({ items: [], total: 0 })
    await callToolHandler({ params: { name: 'list_pending', arguments: {} } })
    expect(mockList).toHaveBeenCalled()
  })

  it('routes hash_file to hashFileTool', async () => {
    mockHash.mockResolvedValue({ hash: HASH })
    await callToolHandler({ params: { name: 'hash_file', arguments: { path: '/tmp/f.txt' } } })
    expect(mockHash).toHaveBeenCalled()
  })

  it('routes watch to openWatchWindow', async () => {
    mockWatch.mockReturnValue({ opened: true, interval_minutes: 30 })
    await callToolHandler({ params: { name: 'watch', arguments: {} } })
    expect(mockWatch).toHaveBeenCalled()
  })

  it('returns isError:true for an unknown tool name', async () => {
    const res = await callToolHandler({ params: { name: 'nonexistent_tool', arguments: {} } })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('unknown_tool')
  })

  it('returns isError:true when the feature gate blocks the tool', async () => {
    vi.mocked(featureDisabledError).mockReturnValue({ error: 'feature_disabled', feature: 'stamp' })
    const res = await callToolHandler({ params: { name: 'create_timestamp', arguments: { hash: HASH } } })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('feature_disabled')
  })

  it('catches tool throws and returns internal_error', async () => {
    mockCreate.mockRejectedValue(new Error('unexpected crash'))
    const res = await callToolHandler({ params: { name: 'create_timestamp', arguments: { hash: HASH } } })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('internal_error')
  })

  it('marks result as isError when the tool returns an error object', async () => {
    mockCreate.mockResolvedValue({ error: 'invalid_hash', details: 'bad' })
    const res = await callToolHandler({ params: { name: 'create_timestamp', arguments: { hash: HASH } } })
    expect(res.isError).toBe(true)
  })

  it('routes upgrade_timestamp to upgradeTimestamp', async () => {
    mockUpgrade.mockResolvedValue({ status: 'pending', id: 'u1' })
    const res = await callToolHandler({ params: { name: 'upgrade_timestamp', arguments: { id: 'u1' } } })
    expect(mockUpgrade).toHaveBeenCalled()
    expect(res.isError).toBe(false)
  })

  it('routes verify_timestamp to verifyTimestamp', async () => {
    mockVerify.mockResolvedValue({ status: 'pending', hash: HASH, calendars: [] })
    const res = await callToolHandler({ params: { name: 'verify_timestamp', arguments: { id: 'v1' } } })
    expect(mockVerify).toHaveBeenCalled()
    expect(res.isError).toBe(false)
  })

  it('routes verify_external_proof without a database operation', async () => {
    mockVerifyExternal.mockResolvedValue({ status: 'pending', hash: HASH, calendars: [] })
    const input = { file_path: '/tmp/record.json', proof_path: '/tmp/record.json.ots' }
    const res = await callToolHandler({ params: { name: 'verify_external_proof', arguments: input } })
    expect(mockVerifyExternal).toHaveBeenCalledWith(input, MOCK_CONFIG)
    expect(mockGetDb).not.toHaveBeenCalled()
    expect(res.isError).toBe(false)
  })

  it('routes inspect_timestamp to inspectTimestamp', async () => {
    mockInspect.mockReturnValue({ id: 'i1', hash: HASH, status: 'pending' })
    const res = await callToolHandler({ params: { name: 'inspect_timestamp', arguments: { id: 'i1' } } })
    expect(mockInspect).toHaveBeenCalled()
    expect(res.isError).toBe(false)
  })

  it('routes stamp_file to stampFile', async () => {
    mockStamp.mockResolvedValue({ status: 'pending', id: 's1', hash: HASH, calendars: [], created_at: '' })
    const res = await callToolHandler({ params: { name: 'stamp_file', arguments: { path: '/tmp/f.txt' } } })
    expect(mockStamp).toHaveBeenCalled()
    expect(res.isError).toBe(false)
  })

  it('returns invalid_params error code when the tool throws with invalid_params in message', async () => {
    mockCreate.mockRejectedValue(new Error('invalid_params: missing hash'))
    const res = await callToolHandler({ params: { name: 'create_timestamp', arguments: { hash: HASH } } })
    expect(res.isError).toBe(true)
    expect(JSON.parse(res.content[0].text).error).toBe('invalid_params')
  })
})
