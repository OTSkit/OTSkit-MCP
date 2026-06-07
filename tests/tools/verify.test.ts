import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeRawDb } from '../helpers/db.js'
import type { DatabaseLike } from '../../src/db/driver.js'
import { writeFileSync, mkdirSync } from 'fs'
import { initDb } from '../../src/db/schema.js'
import { insertStamp, getStamp } from '../../src/db/stamps.js'
import { verifyTimestamp } from '../../src/tools/verify-timestamp.js'
import type { Config } from '../../src/types.js'

const mockVerify = vi.fn().mockResolvedValue({ valid: false, error: 'No Bitcoin attestation found' })

vi.mock('@otskit/client', () => ({
  OpenTimestampsClient: vi.fn().mockImplementation(() => ({
    verify: mockVerify,
  })),
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
    mockVerify.mockResolvedValueOnce({ valid: true, blockHeight: 952440, timestamp: 1748476800 })

    const proofPath = process.env.OTS_MCP_DATA_DIR + '/proofs/c.ots'
    writeFileSync(proofPath, Buffer.from([1, 2, 3]))
    insertStamp(db, { id: 'c-id', hash: 'a'.repeat(64), proof_path: proofPath })

    const result = await verifyTimestamp({ id: 'c-id' }, db, MOCK_CONFIG)

    expect(result).toMatchObject({ status: 'confirmed', bitcoin_block: 952440 })
    const record = getStamp(db, 'c-id')
    expect(record?.status).toBe('confirmed')
    expect(record?.bitcoin_block).toBe(952440)
  })

  it('returns unknown (no crash) when verify is valid but missing blockHeight/timestamp', async () => {
    mockVerify.mockResolvedValueOnce({ valid: true })

    const proofPath = process.env.OTS_MCP_DATA_DIR + '/proofs/g.ots'
    writeFileSync(proofPath, Buffer.from([1, 2, 3]))
    insertStamp(db, { id: 'g-id', hash: 'a'.repeat(64), proof_path: proofPath })

    const result = await verifyTimestamp({ id: 'g-id' }, db, MOCK_CONFIG)
    expect(result).toMatchObject({ status: 'unknown', hash: 'a'.repeat(64) })
  })
})
