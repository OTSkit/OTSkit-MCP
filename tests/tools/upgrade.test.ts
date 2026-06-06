import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeRawDb } from '../helpers/db.js'
import type { DatabaseLike } from '../../src/db/driver.js'
import { writeFileSync, mkdirSync } from 'fs'
import { initDb } from '../../src/db/schema.js'
import { insertStamp, getStamp } from '../../src/db/stamps.js'
import { upgradeTimestamp } from '../../src/tools/upgrade-timestamp.js'
import type { Config } from '../../src/types.js'

const { mockUpgrade, MockUpgradeError, mockDeserialize } = vi.hoisted(() => {
  class MockUpgradeError extends Error {}
  return {
    mockUpgrade: vi.fn().mockResolvedValue(Buffer.from([1, 2, 3])),
    MockUpgradeError,
    mockDeserialize: vi.fn().mockReturnValue({ timestamp: { attestations: [], branches: [] } }),
  }
})

vi.mock('@otskit/client', () => ({
  OpenTimestampsClient: vi.fn().mockImplementation(() => ({
    upgrade: mockUpgrade,
  })),
  UpgradeError: MockUpgradeError,
}))

vi.mock('@otskit/core', () => ({
  DetachedTimestampFile: { deserialize: mockDeserialize },
  StreamDeserializationContext: vi.fn().mockImplementation((bytes: Uint8Array) => bytes),
}))

const MOCK_CONFIG: Config = {
  stamp_enabled: true, preserve_enabled: true, preserve_whitelist: [],
  preserve_max_bytes: 104_857_600, preserve_max_files: 10_000,
  scheduler_interval_minutes: 30, calendar_timeout_ms: 10_000,
  calendar_max_response_bytes: 1_048_576, retry_max_attempts: 20,
  log_file: '/tmp/test.log', calendars: [], esplora_url: 'https://blockstream.info/api',
}

let db: DatabaseLike

beforeEach(() => {
  process.env.OTS_MCP_DATA_DIR = `/tmp/ots-upgrade-test-${Date.now()}`
  mkdirSync(process.env.OTS_MCP_DATA_DIR + '/proofs', { recursive: true })
  db = makeRawDb()
  initDb(db)
})
afterEach(() => { delete process.env.OTS_MCP_DATA_DIR })

describe('upgrade', () => {
  it('returns not_found for unknown id', async () => {
    const result = await upgradeTimestamp({ id: 'nonexistent' }, db, MOCK_CONFIG)
    expect(result).toMatchObject({ error: 'not_found' })
  })

  it('returns pending when no bitcoin attestation', async () => {
    const proofPath = process.env.OTS_MCP_DATA_DIR + '/proofs/test.ots'
    writeFileSync(proofPath, Buffer.from([1, 2, 3]))
    insertStamp(db, { id: 'up-id', hash: 'a'.repeat(64), proof_path: proofPath })

    const result = await upgradeTimestamp({ id: 'up-id' }, db, MOCK_CONFIG)
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.status).toBe('pending')
      expect(result.attempt_count).toBe(1)
    }
  })

  it('returns confirmed and updates DB when calendar fails but .ots already has bitcoin attestation', async () => {
    mockUpgrade.mockRejectedValueOnce(new MockUpgradeError('calendar unavailable'))
    mockDeserialize.mockReturnValueOnce({
      timestamp: { attestations: [{ kind: 'bitcoin', height: 952440 }], branches: [] },
    })

    const proofPath = process.env.OTS_MCP_DATA_DIR + '/proofs/btc.ots'
    writeFileSync(proofPath, Buffer.from([1, 2, 3]))
    insertStamp(db, { id: 'btc-id', hash: 'a'.repeat(64), proof_path: proofPath })

    const result = await upgradeTimestamp({ id: 'btc-id' }, db, MOCK_CONFIG)

    expect(result).toMatchObject({ id: 'btc-id', status: 'confirmed', bitcoin_block: 952440 })
    const record = getStamp(db, 'btc-id')
    expect(record?.status).toBe('confirmed')
    expect(record?.bitcoin_block).toBe(952440)
  })
})
