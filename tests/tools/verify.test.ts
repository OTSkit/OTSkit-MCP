import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeRawDb } from '../helpers/db.js'
import type { DatabaseLike } from '../../src/db/driver.js'
import { writeFileSync, mkdirSync } from 'fs'
import { initDb } from '../../src/db/schema.js'
import { insertStamp, getStamp } from '../../src/db/stamps.js'
import { verifyTimestamp } from '../../src/tools/verify-timestamp.js'
import type { Config } from '../../src/types.js'

// Mocks use the real @otskit/client VerificationResult union (discriminated on `status`).
const mockVerify = vi.fn().mockResolvedValue({ status: 'pending', reason: 'No Bitcoin attestation found — timestamp not yet confirmed' })

vi.mock('@otskit/client', () => ({
  OpenTimestampsClient: vi.fn().mockImplementation(function() {
    return {
      verify: mockVerify,
    }
  }),
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
  process.env.OTS_MCP_DATA_DIR = `/tmp/ots-verify-test-${Date.now()}`
  mkdirSync(process.env.OTS_MCP_DATA_DIR + '/proofs', { recursive: true })
  db = makeRawDb()
  initDb(db)
})
afterEach(() => { delete process.env.OTS_MCP_DATA_DIR })

describe('verify', () => {
  it('returns not_found for unknown id', async () => {
    const result = await verifyTimestamp({ id: 'nope' }, db, MOCK_CONFIG)
    expect(result).toMatchObject({ error: 'not_found' })
  })

  it('returns pending when no bitcoin attestation', async () => {
    const proofPath = process.env.OTS_MCP_DATA_DIR + '/proofs/v.ots'
    writeFileSync(proofPath, Buffer.from([1, 2, 3]))
    insertStamp(db, { id: 'v-id', hash: 'a'.repeat(64), proof_path: proofPath })

    const result = await verifyTimestamp({ id: 'v-id' }, db, MOCK_CONFIG)
    expect(result).toHaveProperty('status', 'pending')
    expect(result).toHaveProperty('hash', 'a'.repeat(64))
  })

  it('updates DB to confirmed when bitcoin verification succeeds', async () => {
    mockVerify.mockResolvedValueOnce({ status: 'verified', blockHeight: 952440, blockTime: 1748476800 })

    const proofPath = process.env.OTS_MCP_DATA_DIR + '/proofs/c.ots'
    writeFileSync(proofPath, Buffer.from([1, 2, 3]))
    insertStamp(db, { id: 'c-id', hash: 'a'.repeat(64), proof_path: proofPath })

    const result = await verifyTimestamp({ id: 'c-id' }, db, MOCK_CONFIG)

    expect(result).toMatchObject({ status: 'confirmed', bitcoin_block: 952440 })
    const record = getStamp(db, 'c-id')
    expect(record?.status).toBe('confirmed')
    expect(record?.bitcoin_block).toBe(952440)
    // blockTime (epoch s) must be rendered as an ISO string.
    expect(record?.bitcoin_time).toBe(new Date(1748476800 * 1000).toISOString())
  })

  it('returns invalid when the cryptographic verification fails', async () => {
    mockVerify.mockResolvedValueOnce({ status: 'invalid', reason: 'File hash does not match proof' })

    const proofPath = process.env.OTS_MCP_DATA_DIR + '/proofs/i.ots'
    writeFileSync(proofPath, Buffer.from([1, 2, 3]))
    insertStamp(db, { id: 'i-id', hash: 'a'.repeat(64), proof_path: proofPath })

    const result = await verifyTimestamp({ id: 'i-id' }, db, MOCK_CONFIG)
    expect(result).toMatchObject({ status: 'invalid', hash: 'a'.repeat(64), reason: 'File hash does not match proof' })
    expect(getStamp(db, 'i-id')?.status).not.toBe('confirmed')
  })

  it('returns network_error when the explorer is unreachable', async () => {
    mockVerify.mockResolvedValueOnce({ status: 'network_error', reason: 'Could not reach Bitcoin blockchain' })

    const proofPath = process.env.OTS_MCP_DATA_DIR + '/proofs/n.ots'
    writeFileSync(proofPath, Buffer.from([1, 2, 3]))
    insertStamp(db, { id: 'n-id', hash: 'a'.repeat(64), proof_path: proofPath })

    const result = await verifyTimestamp({ id: 'n-id' }, db, MOCK_CONFIG)
    expect(result).toMatchObject({ status: 'network_error', hash: 'a'.repeat(64) })
    expect(getStamp(db, 'n-id')?.status).not.toBe('confirmed')
  })

  it('returns network_error when verify throws', async () => {
    mockVerify.mockRejectedValueOnce(new Error('socket hang up'))

    const proofPath = process.env.OTS_MCP_DATA_DIR + '/proofs/t.ots'
    writeFileSync(proofPath, Buffer.from([1, 2, 3]))
    insertStamp(db, { id: 't-id', hash: 'a'.repeat(64), proof_path: proofPath })

    const result = await verifyTimestamp({ id: 't-id' }, db, MOCK_CONFIG)
    expect(result).toMatchObject({ status: 'network_error', hash: 'a'.repeat(64) })
  })

  it('returns storage_error when the stamp record has no proof_path', async () => {
    insertStamp(db, { id: 'np-id', hash: 'a'.repeat(64), proof_path: '/tmp/will-be-nulled.ots' })
    db.run('UPDATE stamps SET proof_path = NULL WHERE id = ?', ['np-id'])

    const result = await verifyTimestamp({ id: 'np-id' }, db, MOCK_CONFIG)
    expect(result).toMatchObject({ error: 'storage_error' })
  })

  it('returns storage_error when the proof file has been deleted from disk', async () => {
    insertStamp(db, { id: 'del-id', hash: 'a'.repeat(64), proof_path: '/nonexistent/deleted.ots' })

    const result = await verifyTimestamp({ id: 'del-id' }, db, MOCK_CONFIG)
    expect(result).toMatchObject({ error: 'storage_error' })
  })
})
