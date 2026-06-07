import { mkdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { OpenTimestampsClient } from '@otskit/client'
import type { DatabaseLike } from '../db/driver.js'
import type { Config } from '../types.js'
import { getDataDir } from '../config.js'
import { insertStamp } from '../db/stamps.js'
import { logOperation } from '../db/operations-log.js'
import { writeAtomic } from '../utils.js'

const HEX64 = /^[0-9a-f]{64}$/i

type CreateTimestampSuccess = {
  id: string; hash: string; status: 'pending'
  calendars: string[]; created_at: string; proof_path: string
}
type CreateTimestampError = {
  error: 'invalid_hash' | 'calendar_error' | 'storage_error'
  details: string
}

export async function createTimestamp(
  input: { hash: string },
  db: DatabaseLike,
  config: Config
): Promise<CreateTimestampSuccess | CreateTimestampError> {
  if (!HEX64.test(input.hash)) {
    return { error: 'invalid_hash', details: 'hash must be 64 hex characters (SHA-256)' }
  }

  const normalizedHash = input.hash.toLowerCase()
  const client = new OpenTimestampsClient({
    calendars: config.calendars,
    resilience: {
      totalTimeoutMs: config.calendar_timeout_ms,
      connectTimeoutMs: Math.min(config.calendar_timeout_ms, 5000),
      retries: { enabled: true, maxAttempts: config.retry_max_attempts, backoff: { strategy: 'exponential', initialDelayMs: 500, jitter: 'full' } },
    },
  })

  const t0 = Date.now()
  let proofBuffer: Buffer
  try {
    proofBuffer = await client.stamp(normalizedHash)
  } catch (e) {
    return { error: 'calendar_error', details: String(e) }
  }
  const responseTimeMs = Date.now() - t0

  const id = randomUUID()
  const proofDir = join(getDataDir(), 'proofs')
  mkdirSync(proofDir, { recursive: true })
  const proofPath = join(proofDir, `${id}.ots`)

  try {
    writeAtomic(proofPath, proofBuffer)
  } catch (e) {
    return { error: 'storage_error', details: String(e) }
  }

  const record = insertStamp(db, { id, hash: normalizedHash, proof_path: proofPath })
  logOperation(db, { stamp_id: id, action: 'stamp', result: 'success', response_time_ms: responseTimeMs })

  return {
    id: record.id,
    hash: record.hash,
    status: 'pending',
    calendars: config.calendars,
    created_at: record.created_at,
    proof_path: proofPath,
  }
}
