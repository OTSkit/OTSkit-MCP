import { readFileSync, statSync } from 'node:fs'
import { DetachedTimestampFile } from '@otskit/client'
import type { DatabaseLike } from '../db/driver.js'
import type { Config } from '../types.js'
import { getStamp } from '../db/stamps.js'

type InspectErr = { error: 'not_found' | 'proof_missing'; details: string }
type InspectOk  = {
  id: string
  hash: string
  status: string
  created_at: string
  proof_exists: boolean
  proof_size_bytes: number
  calendar_attestations: number
  bitcoin_attestations: number
  bitcoin_confirmed: boolean
  bitcoin_block: number | null
}

export function inspectTimestamp(
  input: { id: string },
  db: DatabaseLike,
  _config: Config
): InspectOk | InspectErr {
  const record = getStamp(db, input.id)
  if (!record) return { error: 'not_found', details: `No stamp with id ${input.id}` }
  if (!record.proof_path) return { error: 'proof_missing', details: 'No proof file on record' }

  let proofBytes: Buffer
  let proofSize: number
  try {
    proofSize = statSync(record.proof_path).size
    proofBytes = readFileSync(record.proof_path)
  } catch {
    return { error: 'proof_missing', details: `Cannot read proof: ${record.proof_path}` }
  }

  let calendarAttestations = 0
  let bitcoinAttestations = 0
  let bitcoinBlock: number | null = null
  try {
    const proof = DetachedTimestampFile.deserialize(new Uint8Array(proofBytes))
    const attestations = proof.timestamp.getAttestations()
    bitcoinAttestations = attestations.filter(a => a.kind === 'bitcoin').length
    calendarAttestations = attestations.filter(a => a.kind !== 'bitcoin').length
    if (bitcoinAttestations > 0) {
      const blocks = attestations.filter(a => a.kind === 'bitcoin').map(a => (a as any).height as number)
      bitcoinBlock = blocks.length > 0 ? Math.min(...blocks) : null
    }
  } catch {
    // partial or invalid proof — return what we know
  }

  return {
    id: record.id,
    hash: record.hash,
    status: record.status,
    created_at: record.created_at,
    proof_exists: true,
    proof_size_bytes: proofSize,
    calendar_attestations: calendarAttestations,
    bitcoin_attestations: bitcoinAttestations,
    bitcoin_confirmed: bitcoinAttestations > 0,
    bitcoin_block: bitcoinBlock,
  }
}
