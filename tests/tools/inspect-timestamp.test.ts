import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { writeFileSync, mkdirSync } from 'fs'
import { initDb } from '../../src/db/schema.js'
import { insertStamp } from '../../src/db/stamps.js'
import { inspectTimestamp } from '../../src/tools/inspect-timestamp.js'
import type { Config } from '../../src/types.js'

const MOCK_CONFIG: Config = {
  stamp_enabled: true, preserve_enabled: true, preserve_whitelist: [],
  preserve_max_bytes: 104_857_600, preserve_max_files: 10_000,
  scheduler_interval_minutes: 30, calendar_timeout_ms: 10_000,
  calendar_max_response_bytes: 1_048_576, retry_max_attempts: 20,
  log_file: '/tmp/test.log', calendars: [], esplora_url: 'https://blockstream.info/api',
}

let db: ReturnType<typeof Database>

beforeEach(() => {
  process.env.OTS_MCP_DATA_DIR = `/tmp/ots-inspect-test-${Date.now()}`
  mkdirSync(process.env.OTS_MCP_DATA_DIR + '/proofs', { recursive: true })
  db = new Database(':memory:')
  initDb(db)
})
afterEach(() => { delete process.env.OTS_MCP_DATA_DIR })

describe('inspect_timestamp', () => {
  it('returns not_found for unknown id', () => {
    const result = inspectTimestamp({ id: 'nope' }, db, MOCK_CONFIG)
    expect(result).toMatchObject({ error: 'not_found' })
  })

  it('returns proof_missing when proof file does not exist on disk', () => {
    insertStamp(db, { id: 'i-1', hash: 'a'.repeat(64), proof_path: '/nonexistent/x.ots' })
    const result = inspectTimestamp({ id: 'i-1' }, db, MOCK_CONFIG)
    expect(result).toMatchObject({ error: 'proof_missing' })
  })

  it('returns proof metadata without making network calls', () => {
    const proofPath = process.env.OTS_MCP_DATA_DIR + '/proofs/inspect.ots'
    writeFileSync(proofPath, Buffer.from([1, 2, 3]))
    insertStamp(db, { id: 'i-2', hash: 'a'.repeat(64), proof_path: proofPath })

    const result = inspectTimestamp({ id: 'i-2' }, db, MOCK_CONFIG)

    expect(result).not.toHaveProperty('error')
    expect(result).toHaveProperty('id', 'i-2')
    expect(result).toHaveProperty('hash', 'a'.repeat(64))
    expect(result).toHaveProperty('status', 'pending')
    expect(result).toHaveProperty('proof_size_bytes', 3)
    expect(result).toHaveProperty('attestation_count', 0)
    expect(result).toHaveProperty('has_bitcoin_confirmation', false)
  })
})
