import { readFileSync } from 'node:fs'
import { OpenTimestampsClient, UpgradeError } from '@otskit/client'
import type { DatabaseLike } from '../db/driver.js'
import type { Config } from '../types.js'
import { getStamp, updateStampStatus } from '../db/stamps.js'
import { logOperation } from '../db/operations-log.js'
import { writeAtomic } from '../utils.js'

type UpgradeTimestampConfirmed = { id: string; status: 'confirmed'; bitcoin_block: number; bitcoin_time: string }
type UpgradeTimestampPending   = { id: string; status: 'pending'; attempt_count: number; last_attempt_at: string; next_retry_at: string }
type UpgradeTimestampErr       = { error: 'not_found' | 'calendar_error' | 'storage_error' | 'invalid_proof'; details: string }

type ChainCheck =
  | { outcome: 'verified'; block: number; time: string }
  | { outcome: 'unconfirmed' }
  | { outcome: 'invalid'; reason: string }

/**
 * A Bitcoin attestation inside the .ots bytes proves nothing on its own: those bytes come from a
 * calendar or from local disk, and either can carry a forged one. Only the block header settles
 * it, and it is also the only truthful source of the block time.
 */
async function checkAgainstChain(
  client: OpenTimestampsClient,
  proof: Buffer,
  hash: string
): Promise<ChainCheck> {
  let result
  try {
    result = await client.verify(proof, hash)
  } catch {
    // Transport failure — says nothing about the proof, so retry later.
    return { outcome: 'unconfirmed' }
  }
  if (result.status === 'verified') {
    return {
      outcome: 'verified',
      block: result.blockHeight,
      time: new Date(result.blockTime * 1000).toISOString(),
    }
  }
  if (result.status === 'invalid') return { outcome: 'invalid', reason: result.reason }
  return { outcome: 'unconfirmed' }
}

function nextRetryAt(attemptCount: number): string {
  const base = Math.min(30_000 * Math.pow(2, attemptCount), 3_600_000)
  const jitter = Math.random() * 0.2 * base
  return new Date(Date.now() + base + jitter).toISOString()
}

export async function upgradeTimestamp(
  input: { id: string },
  db: DatabaseLike,
  config: Config
): Promise<UpgradeTimestampConfirmed | UpgradeTimestampPending | UpgradeTimestampErr> {
  const record = getStamp(db, input.id)
  if (!record) return { error: 'not_found', details: `No stamp with id ${input.id}` }
  if (!record.proof_path) return { error: 'storage_error', details: 'No proof_path on record' }

  const proofBefore = readFileSync(record.proof_path)
  const client = new OpenTimestampsClient({
    calendars: config.calendars,
    resilience: {
      totalTimeoutMs: config.calendar_timeout_ms,
      connectTimeoutMs: Math.min(config.calendar_timeout_ms, 5000),
      retries: { enabled: true, maxAttempts: config.retry_max_attempts, backoff: { strategy: 'exponential', initialDelayMs: 500, jitter: 'full' } },
    },
  })

  const now = new Date().toISOString()
  const newAttemptCount = record.attempt_count + 1
  const next = nextRetryAt(newAttemptCount)

  let upgraded: Buffer | null = null
  try {
    upgraded = await client.upgrade(proofBefore)
  } catch (e) {
    if (!(e instanceof UpgradeError)) {
      updateStampStatus(db, input.id, { last_attempt_at: now, attempt_count: newAttemptCount, last_error: String(e), next_retry_at: next })
      logOperation(db, { stamp_id: input.id, action: 'upgrade', result: 'failed', error_msg: String(e) })
      return { error: 'calendar_error', details: String(e) }
    }
    // No calendar had news. The stored proof is still checked against the chain below: it may
    // already be complete from an earlier run.
  }

  if (upgraded !== null) writeAtomic(record.proof_path, upgraded)

  const chain = await checkAgainstChain(client, upgraded ?? proofBefore, record.hash)

  if (chain.outcome === 'verified') {
    updateStampStatus(db, input.id, {
      status: 'confirmed', bitcoin_block: chain.block, bitcoin_time: chain.time,
      confirmed_at: now, last_attempt_at: now, attempt_count: newAttemptCount,
    })
    logOperation(db, { stamp_id: input.id, action: 'upgrade', result: 'success' })
    return { id: input.id, status: 'confirmed', bitcoin_block: chain.block, bitcoin_time: chain.time }
  }

  if (chain.outcome === 'invalid') {
    updateStampStatus(db, input.id, {
      status: 'failed', last_error: chain.reason, last_attempt_at: now, attempt_count: newAttemptCount,
    })
    logOperation(db, { stamp_id: input.id, action: 'upgrade', result: 'failed', error_msg: chain.reason })
    return { error: 'invalid_proof', details: chain.reason }
  }

  updateStampStatus(db, input.id, { last_attempt_at: now, attempt_count: newAttemptCount, next_retry_at: next })
  logOperation(db, { stamp_id: input.id, action: 'upgrade', result: 'pending' })
  return { id: input.id, status: 'pending', attempt_count: newAttemptCount, last_attempt_at: now, next_retry_at: next }
}
