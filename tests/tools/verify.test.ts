import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { writeFileSync, mkdirSync } from 'fs'
import { initDb } from '../../src/db/schema.js'
import { insertStamp } from '../../src/db/stamps.js'
import { verifyTimestamp } from '../../src/tools/verify-timestamp.js'
import type { Config } from '../../src/types.js'

vi.mock('@alexalves87/opentimestamps-client', () => ({
  OpenTimestampsClient: vi.fn().mockImplementation(() => ({
    verify: vi.fn().mockResolvedValue({ valid: false, error: 'No Bitcoin attestation found' }),
  })),
}))

const MOCK_CONFIG: Config = {
  stamp_enabled: true, preserve_enabled: true, preserve_whitelist: [],
  preserve_max_bytes: 104_857_600, preserve_max_files: 10_000,
  scheduler_interval_minutes: 30, calendar_timeout_ms: 10_000,
  calendar_max_response_bytes: 1_048_576, retry_max_attempts: 20,
  log_file: '/tmp/test.log', calendars: [], esplora_url: 'https://blockstream.info/api',
}

let db: ReturnType<typeof Database>

beforeEach(() => {
  process.env.OTS_MCP_DATA_DIR = `/tmp/ots-verify-test-${Date.now()}`
  mkdirSync(process.env.OTS_MCP_DATA_DIR + '/proofs', { recursive: true })
  db = new Database(':memory:')
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
})
