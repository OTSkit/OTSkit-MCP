import { readFileSync } from 'fs'
import { OpenTimestampsClient, UpgradeError } from '@otskit/client'
import { DetachedTimestampFile } from '@otskit/core'
import type { Database } from 'better-sqlite3'
import type { Config } from '../types.js'
import { getStamp, updateStampStatus } from '../db/stamps.js'
import { logOperation } from '../db/operations-log.js'
import { writeAtomic } from '../utils.js'

type UpgradeTimestampConfirmed = { id: string; status: 'confirmed'; bitcoin_block: number; bitcoin_time: string; proof_path: string }
type UpgradeTimestampPending   = { id: string; status: 'pending'; attempt_count: number; last_attempt_at: string; next_retry_at: string }
type UpgradeTimestampErr       = { error: 'not_found' | 'calendar_error' | 'storage_error'; details: string }

function checkBitcoinConfirmation(bytes: Buffer): { confirmed: boolean; block?: number } {
  try {
    const proof = DetachedTimestampFile.deserialize(new Uint8Array(bytes))
    const attestations = proof.timestamp.getAttestations()
    const bitcoin = attestations.filter(a => a.kind === 'bitcoin')
    if (bitcoin.length > 0) {
      const block = Math.min(...bitcoin.map(a => (a as any).height as number))
      return { confirmed: true, block }
    }
    return { confirmed: false }
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
  db: Database,
  config: Config
): Promise<UpgradeTimestampConfirmed | UpgradeTimestampPending | UpgradeTimestampErr> {
  const record = getStamp(db, input.id)
  if (!record) return { error: 'not_found', details: `No stamp with id ${input.id}` }
  if (!record.proof_path) return { error: 'storage_error', details: 'No proof_path on record' }

  const proofBefore = readFileSync(record.proof_path)
  const client = new OpenTimestampsClient({
    calendars: config.calendars,
    resilience: { timeout: config.calendar_timeout_ms },
  })

  const now = new Date().toISOString()
  const newAttemptCount = record.attempt_count + 1
  const next = nextRetryAt(newAttemptCount)

  let upgraded: Buffer
  try {
    upgraded = await client.upgrade(proofBefore)
  } catch (e) {
    if (e instanceof UpgradeError) {
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
    return { id: input.id, status: 'confirmed', bitcoin_block: block, bitcoin_time: bitcoinTime, proof_path: record.proof_path }
  }

  updateStampStatus(db, input.id, { last_attempt_at: now, attempt_count: newAttemptCount, next_retry_at: next })
  logOperation(db, { stamp_id: input.id, action: 'upgrade', result: 'pending' })
  return { id: input.id, status: 'pending', attempt_count: newAttemptCount, last_attempt_at: now, next_retry_at: next }
}
