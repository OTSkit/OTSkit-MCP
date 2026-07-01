import { readFileSync } from 'node:fs'
import { OpenTimestampsClient, UpgradeError, DetachedTimestampFile } from '@otskit/client'
import type { DatabaseLike } from '../db/driver.js'
import type { Config } from '../types.js'
import { getStamp, updateStampStatus } from '../db/stamps.js'
import { logOperation } from '../db/operations-log.js'
import { writeAtomic } from '../utils.js'

type UpgradeTimestampConfirmed = { id: string; status: 'confirmed'; bitcoin_block: number; bitcoin_time: string }
type UpgradeTimestampPending   = { id: string; status: 'pending'; attempt_count: number; last_attempt_at: string; next_retry_at: string }
type UpgradeTimestampErr       = { error: 'not_found' | 'calendar_error' | 'storage_error'; details: string }

function collectAttestations(ts: any, depth = 0): any[] {
  if (!ts || depth > 20) return []
  const atts = [...(ts.attestations ?? [])]
  for (const branch of (ts.branches ?? [])) {
    if (branch?.stamp) {
      atts.push(...collectAttestations(branch.stamp, depth + 1))
    }
  }
  return atts
}

function checkBitcoinConfirmation(bytes: Buffer): { confirmed: boolean; block?: number } {
  try {
    const dtf = DetachedTimestampFile.deserialize(new Uint8Array(bytes))
    const attestations = collectAttestations(dtf.timestamp)
    const bitcoinAtts = attestations.filter((a: any) => a.kind === 'bitcoin')
    if (bitcoinAtts.length === 0) return { confirmed: false }
    const block = Math.min(...bitcoinAtts.map((a: any) => a.height as number))
    return { confirmed: true, block }
  } catch {
    return { confirmed: false }
  }
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

  let upgraded: Buffer
  try {
    upgraded = await client.upgrade(proofBefore)
  } catch (e) {
    if (e instanceof UpgradeError) {
      // Do NOT trust the local .ots attestation — an attacker with write access to the
      // proofs dir could forge a Bitcoin attestation. Verify against the blockchain instead.
      try {
        const v = await client.verify(proofBefore, record.hash)
        if (v.status === 'verified') {
          const bitcoinTime = new Date(v.blockTime * 1000).toISOString()
          updateStampStatus(db, input.id, {
            status: 'confirmed', bitcoin_block: v.blockHeight, bitcoin_time: bitcoinTime,
            confirmed_at: now, last_attempt_at: now, attempt_count: newAttemptCount,
          })
          logOperation(db, { stamp_id: input.id, action: 'upgrade', result: 'success' })
          return { id: input.id, status: 'confirmed', bitcoin_block: v.blockHeight, bitcoin_time: bitcoinTime }
        }
      } catch { /* network error — fall through to pending */ }
      updateStampStatus(db, input.id, { last_attempt_at: now, attempt_count: newAttemptCount, next_retry_at: next })
      logOperation(db, { stamp_id: input.id, action: 'upgrade', result: 'pending' })
      return { id: input.id, status: 'pending', attempt_count: newAttemptCount, last_attempt_at: now, next_retry_at: next }
    }
    updateStampStatus(db, input.id, { last_attempt_at: now, attempt_count: newAttemptCount, last_error: String(e), next_retry_at: next })
    logOperation(db, { stamp_id: input.id, action: 'upgrade', result: 'failed', error_msg: String(e) })
    return { error: 'calendar_error', details: String(e) }
  }

  writeAtomic(record.proof_path, upgraded)

  const { confirmed, block } = checkBitcoinConfirmation(upgraded)
  if (confirmed && block !== undefined) {
    const bitcoinTime = now
    updateStampStatus(db, input.id, {
      status: 'confirmed', bitcoin_block: block, bitcoin_time: bitcoinTime,
      confirmed_at: now, last_attempt_at: now, attempt_count: newAttemptCount,
    })
    logOperation(db, { stamp_id: input.id, action: 'upgrade', result: 'success' })
    return { id: input.id, status: 'confirmed', bitcoin_block: block, bitcoin_time: bitcoinTime }
  }

  updateStampStatus(db, input.id, { last_attempt_at: now, attempt_count: newAttemptCount, next_retry_at: next })
  logOperation(db, { stamp_id: input.id, action: 'upgrade', result: 'pending' })
  return { id: input.id, status: 'pending', attempt_count: newAttemptCount, last_attempt_at: now, next_retry_at: next }
}
