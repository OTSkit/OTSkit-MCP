import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeRawDb } from '../helpers/db.js'
import type { DatabaseLike } from '../../src/db/driver.js'
import { writeFileSync, mkdirSync } from 'fs'
import { initDb } from '../../src/db/schema.js'
import { insertStamp, getStamp } from '../../src/db/stamps.js'
import { upgradeTimestamp } from '../../src/tools/upgrade-timestamp.js'
import type { Config } from '../../src/types.js'

const { mockUpgrade, mockVerify, MockUpgradeError } = vi.hoisted(() => {
  class MockUpgradeError extends Error {}
  return {
    mockUpgrade: vi.fn().mockResolvedValue(Buffer.from([1, 2, 3])),
    // VerificationResult union (discriminated on `status`), matching @otskit/client.
    mockVerify: vi.fn().mockResolvedValue({ status: 'pending', reason: 'No Bitcoin attestation' }),
    MockUpgradeError,
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
    // The attestation stored on disk is never taken at face value — the chain is authoritative.
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

  it('does NOT confirm an upgraded proof the blockchain does not back', async () => {
    // The calendar answered with fresh bytes, but nothing on-chain corroborates them.
    mockUpgrade.mockResolvedValueOnce(Buffer.from([0xaa, 0xbb]))
    mockVerify.mockResolvedValueOnce({ status: 'pending', reason: 'No Bitcoin attestation' })

    const proofPath = process.env.OTS_MCP_DATA_DIR + '/proofs/unbacked.ots'
    writeFileSync(proofPath, Buffer.from([1, 2, 3]))
    insertStamp(db, { id: 'unbacked-id', hash: 'a'.repeat(64), proof_path: proofPath })

    const result = await upgradeTimestamp({ id: 'unbacked-id' }, db, MOCK_CONFIG)
    expect(result).toMatchObject({ id: 'unbacked-id', status: 'pending' })
    expect(getStamp(db, 'unbacked-id')?.status).toBe('pending')
  })

  it('confirms with the block time from the chain, never the local clock', async () => {
    mockUpgrade.mockResolvedValueOnce(Buffer.from([0xaa, 0xbb]))
    mockVerify.mockResolvedValueOnce({ status: 'verified', blockHeight: 850000, blockTime: 1_700_000_000 })

    const proofPath = process.env.OTS_MCP_DATA_DIR + '/proofs/confirmed.ots'
    writeFileSync(proofPath, Buffer.from([1, 2, 3]))
    insertStamp(db, { id: 'conf-id', hash: 'a'.repeat(64), proof_path: proofPath })

    const result = await upgradeTimestamp({ id: 'conf-id' }, db, MOCK_CONFIG)
    const blockTime = new Date(1_700_000_000 * 1000).toISOString()
    expect(result).toMatchObject({ id: 'conf-id', status: 'confirmed', bitcoin_block: 850000, bitcoin_time: blockTime })
    const record = getStamp(db, 'conf-id')
    expect(record?.status).toBe('confirmed')
    expect(record?.bitcoin_time).toBe(blockTime)
  })

  it('checks the chain on both routes: after a calendar upgrade and after UpgradeError', async () => {
    const proofOnDisk = Buffer.from([1, 2, 3])
    const fromCalendar = Buffer.from([0xaa, 0xbb])
    const hash = 'a'.repeat(64)

    const upgradedPath = process.env.OTS_MCP_DATA_DIR + '/proofs/route-upgraded.ots'
    writeFileSync(upgradedPath, proofOnDisk)
    insertStamp(db, { id: 'route-up', hash, proof_path: upgradedPath })
    mockUpgrade.mockResolvedValueOnce(fromCalendar)
    mockVerify.mockClear()
    await upgradeTimestamp({ id: 'route-up' }, db, MOCK_CONFIG)
    // The bytes the calendar just returned are what gets checked, against the record's hash.
    expect(mockVerify).toHaveBeenCalledTimes(1)
    expect(mockVerify).toHaveBeenCalledWith(fromCalendar, hash)

    const stalePath = process.env.OTS_MCP_DATA_DIR + '/proofs/route-stale.ots'
    writeFileSync(stalePath, proofOnDisk)
    insertStamp(db, { id: 'route-stale', hash, proof_path: stalePath })
    mockUpgrade.mockRejectedValueOnce(new MockUpgradeError('calendar unavailable'))
    mockVerify.mockClear()
    await upgradeTimestamp({ id: 'route-stale' }, db, MOCK_CONFIG)
    expect(mockVerify).toHaveBeenCalledTimes(1)
    expect(mockVerify).toHaveBeenCalledWith(proofOnDisk, hash)
  })

  it('marks the stamp failed when the chain contradicts the proof', async () => {
    mockUpgrade.mockResolvedValueOnce(Buffer.from([0xaa, 0xbb]))
    mockVerify.mockResolvedValueOnce({ status: 'invalid', reason: 'File hash does not match proof' })

    const proofPath = process.env.OTS_MCP_DATA_DIR + '/proofs/forged.ots'
    writeFileSync(proofPath, Buffer.from([1, 2, 3]))
    insertStamp(db, { id: 'forged-id', hash: 'a'.repeat(64), proof_path: proofPath })

    const result = await upgradeTimestamp({ id: 'forged-id' }, db, MOCK_CONFIG)
    expect(result).toMatchObject({ error: 'invalid_proof', details: 'File hash does not match proof' })
    const record = getStamp(db, 'forged-id')
    expect(record?.status).toBe('failed')
    expect(record?.last_error).toBe('File hash does not match proof')
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

  // An unreachable explorer says nothing about the proof, so the stamp has to
  // stay pending and be retried rather than be failed or confirmed on a guess.
  it('keeps the stamp pending when the explorer cannot be reached', async () => {
    mockUpgrade.mockResolvedValueOnce(Buffer.from([0xaa, 0xbb]))
    mockVerify.mockRejectedValueOnce(new Error('explorer unreachable'))

    const proofPath = process.env.OTS_MCP_DATA_DIR + '/proofs/transport.ots'
    writeFileSync(proofPath, Buffer.from([1, 2, 3]))
    insertStamp(db, { id: 'transport-id', hash: 'a'.repeat(64), proof_path: proofPath })

    const result = await upgradeTimestamp({ id: 'transport-id' }, db, MOCK_CONFIG)

    expect(result).toMatchObject({ id: 'transport-id', status: 'pending' })
    const record = getStamp(db, 'transport-id')
    expect(record?.status).toBe('pending')
    expect(record?.bitcoin_block).toBeFalsy()
  })
})
