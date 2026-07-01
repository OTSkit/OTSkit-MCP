import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeRawDb } from '../helpers/db.js'
import type { DatabaseLike } from '../../src/db/driver.js'
import { writeFileSync, mkdirSync } from 'fs'
import { initDb } from '../../src/db/schema.js'
import { insertStamp, getStamp } from '../../src/db/stamps.js'
import { upgradeTimestamp } from '../../src/tools/upgrade-timestamp.js'
import type { Config } from '../../src/types.js'

const { mockUpgrade, mockVerify, MockUpgradeError, mockDeserialize } = vi.hoisted(() => {
  class MockUpgradeError extends Error {}
  return {
    mockUpgrade: vi.fn().mockResolvedValue(Buffer.from([1, 2, 3])),
    // VerificationResult union (discriminated on `status`), matching @otskit/client.
    mockVerify: vi.fn().mockResolvedValue({ status: 'pending', reason: 'No Bitcoin attestation' }),
    MockUpgradeError,
    mockDeserialize: vi.fn().mockReturnValue({ timestamp: { attestations: [], branches: [] } }),
  }
})

vi.mock('@otskit/client', () => ({
  OpenTimestampsClient: vi.fn().mockImplementation(function() {
    return {
      upgrade: mockUpgrade,
      verify: mockVerify,
    }
  }),
  UpgradeError: MockUpgradeError,
  DetachedTimestampFile: { deserialize: mockDeserialize },
}))

const MOCK_CONFIG: Config = {
  stamp_enabled: true, preserve_enabled: true, preserve_whitelist: [],
  preserve_max_bytes: 104_857_600, preserve_max_files: 10_000,
  scheduler_interval_minutes: 30, calendar_timeout_ms: 10_000,
  retry_max_attempts: 20,
  log_file: '/tmp/test.log', calendars: [],
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

  it('does NOT confirm from local attestation when upgrade throws UpgradeError and blockchain verify is not valid', async () => {
    mockUpgrade.mockRejectedValueOnce(new MockUpgradeError('calendar unavailable'))
    // checkBitcoinConfirmation is NOT called in the UpgradeError path — blockchain verify is authoritative
    mockVerify.mockResolvedValueOnce({ status: 'pending', reason: 'No Bitcoin attestation' })

    const proofPath = process.env.OTS_MCP_DATA_DIR + '/proofs/fake.ots'
    writeFileSync(proofPath, Buffer.from([1, 2, 3]))
    insertStamp(db, { id: 'fake-id', hash: 'a'.repeat(64), proof_path: proofPath })

    const result = await upgradeTimestamp({ id: 'fake-id' }, db, MOCK_CONFIG)

    expect(result).toMatchObject({ id: 'fake-id', status: 'pending' })
    expect(getStamp(db, 'fake-id')?.status).toBe('pending')
  })

  it('returns calendar_error when upgrade throws a non-UpgradeError exception', async () => {
    mockUpgrade.mockRejectedValueOnce(new Error('unexpected network failure'))

    const proofPath = process.env.OTS_MCP_DATA_DIR + '/proofs/generic-err.ots'
    writeFileSync(proofPath, Buffer.from([1, 2, 3]))
    insertStamp(db, { id: 'err-id', hash: 'a'.repeat(64), proof_path: proofPath })

    const result = await upgradeTimestamp({ id: 'err-id' }, db, MOCK_CONFIG)
    expect(result).toMatchObject({ error: 'calendar_error', details: 'Error: unexpected network failure' })
  })

  it('returns confirmed when the upgraded proof contains a Bitcoin attestation', async () => {
    // mockUpgrade returns a buffer (success); mock deserialize returns bitcoin attestation
    mockUpgrade.mockResolvedValueOnce(Buffer.from([0xaa, 0xbb]))
    mockDeserialize.mockReturnValueOnce({
      timestamp: { attestations: [{ kind: 'bitcoin', height: 850000 }], branches: [] },
    })

    const proofPath = process.env.OTS_MCP_DATA_DIR + '/proofs/confirmed.ots'
    writeFileSync(proofPath, Buffer.from([1, 2, 3]))
    insertStamp(db, { id: 'conf-id', hash: 'a'.repeat(64), proof_path: proofPath })

    const result = await upgradeTimestamp({ id: 'conf-id' }, db, MOCK_CONFIG)
    expect(result).toMatchObject({ id: 'conf-id', status: 'confirmed', bitcoin_block: 850000 })
    expect(getStamp(db, 'conf-id')?.status).toBe('confirmed')
  })

  it('confirms only when blockchain verify succeeds in the UpgradeError path', async () => {
    mockUpgrade.mockRejectedValueOnce(new MockUpgradeError('calendar unavailable'))
    mockVerify.mockResolvedValueOnce({ status: 'verified', blockHeight: 952440, blockTime: 1_700_000_000 })

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
