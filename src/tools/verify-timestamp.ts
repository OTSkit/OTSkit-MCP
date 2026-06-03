import { readFileSync } from 'fs'
import { OpenTimestampsClient } from '@otskit/client'
import type { Database } from 'better-sqlite3'
import type { Config } from '../types.js'
import { getStamp } from '../db/stamps.js'
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
  db: Database,
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
    resilience: { timeout: config.calendar_timeout_ms },
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

  logOperation(db, { stamp_id: input.id, action: 'verify', result: 'success' })
  return {
    status: 'confirmed',
    hash: record.hash,
    bitcoin_block: result.blockHeight!,
    bitcoin_time: new Date(result.timestamp! * 1000).toISOString(),
  }
}
