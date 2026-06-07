import { readFileSync } from 'fs'
import { OpenTimestampsClient } from '@otskit/client'
import type { DatabaseLike } from '../db/driver.js'
import type { Config } from '../types.js'
import { getStamp, updateStampStatus } from '../db/stamps.js'
import { logOperation } from '../db/operations-log.js'

type VerifyTimestampResult =
  | { status: 'confirmed'; hash: string; bitcoin_block: number; bitcoin_time: string }
  | { status: 'pending'; hash: string; calendars: string[] }
  | { status: 'invalid'; hash: string; reason: string }
  | { status: 'network_error'; hash: string; details: string }
  | { status: 'unknown'; hash: string }
  | { error: 'not_found' | 'storage_error'; details: string }

export async function verifyTimestamp(
  input: { id: string },
  db: DatabaseLike,
  config: Config
): Promise<VerifyTimestampResult> {
  const record = getStamp(db, input.id)
  if (!record) return { error: 'not_found', details: `No stamp with id ${input.id}` }
  if (!record.proof_path) return { error: 'storage_error', details: 'No proof_path on record' }

  let proofBytes: Buffer
  try {
    proofBytes = readFileSync(record.proof_path)
  } catch (e) {
    return { error: 'storage_error', details: String(e) }
  }

  const client = new OpenTimestampsClient({
    calendars: config.calendars,
    resilience: {
      totalTimeoutMs: config.calendar_timeout_ms,
      connectTimeoutMs: Math.min(config.calendar_timeout_ms, 5000),
      retries: { enabled: true, maxAttempts: config.retry_max_attempts, backoff: { strategy: 'exponential', initialDelayMs: 500, jitter: 'full' } },
    },
  })

  let result: { valid: boolean; blockHeight?: number; timestamp?: number; error?: string }
  try {
    result = await client.verify(proofBytes, record.hash)
  } catch (e) {
    logOperation(db, { stamp_id: input.id, action: 'verify', result: 'failed', error_msg: String(e) })
    return { status: 'network_error', hash: record.hash, details: String(e) }
  }

  if (!result.valid) {
    if (result.error?.includes('No Bitcoin attestation')) {
      logOperation(db, { stamp_id: input.id, action: 'verify', result: 'pending' })
      return { status: 'pending', hash: record.hash, calendars: config.calendars }
    }
    if (result.error?.toLowerCase().includes('invalid') || result.error?.toLowerCase().includes('corrupt')) {
      logOperation(db, { stamp_id: input.id, action: 'verify', result: 'failed', error_msg: result.error })
      return { status: 'invalid', hash: record.hash, reason: result.error ?? 'unknown' }
    }
    logOperation(db, { stamp_id: input.id, action: 'verify', result: 'failed', error_msg: result.error })
    return { status: 'unknown', hash: record.hash }
  }

  if (result.blockHeight == null || result.timestamp == null) {
    // Library contract violation: valid:true but no block/time. Don't crash or
    // assert — treat as unknown.
    logOperation(db, { stamp_id: input.id, action: 'verify', result: 'failed', error_msg: 'valid:true without blockHeight/timestamp' })
    return { status: 'unknown', hash: record.hash }
  }

  const bitcoinTime = new Date(result.timestamp * 1000).toISOString()
  const now = new Date().toISOString()
  updateStampStatus(db, input.id, {
    status: 'confirmed',
    bitcoin_block: result.blockHeight,
    bitcoin_time: bitcoinTime,
    confirmed_at: now,
  })
  logOperation(db, { stamp_id: input.id, action: 'verify', result: 'success' })
  return {
    status: 'confirmed',
    hash: record.hash,
    bitcoin_block: result.blockHeight,
    bitcoin_time: bitcoinTime,
  }
}
