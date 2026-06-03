import { readFileSync, statSync } from 'fs'
import { DetachedTimestampFile } from '@otskit/core'
import type { Database } from 'better-sqlite3'
import type { Config } from '../types.js'
import { getStamp } from '../db/stamps.js'

type InspectErr = { error: 'not_found' | 'proof_missing'; details: string }
type InspectOk  = {
  id: string
  hash: string
  status: string
  created_at: string
  proof_path: string
  proof_size_bytes: number
  attestation_count: number
  has_bitcoin_confirmation: boolean
  bitcoin_block: number | null
}

export function inspectTimestamp(
  input: { id: string },
  db: Database,
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

  let attestationCount = 0
  let hasBitcoin = false
  let bitcoinBlock: number | null = null
  try {
    const proof = DetachedTimestampFile.deserialize(new Uint8Array(proofBytes))
    const attestations = proof.timestamp.getAttestations()
    attestationCount = attestations.length
    hasBitcoin = attestations.some(a => a.kind === 'bitcoin')
    if (hasBitcoin) {
      const blocks = attestations.filter(a => a.kind === 'bitcoin').map(a => (a as any).height as number)
      bitcoinBlock = blocks.length > 0 ? Math.min(...blocks) : null
    }
  } catch {
    // prueba parcial o inválida — devolvemos lo que sabemos
  }

  return {
    id: record.id,
    hash: record.hash,
    status: record.status,
    created_at: record.created_at,
    proof_path: record.proof_path,
    proof_size_bytes: proofSize,
    attestation_count: attestationCount,
    has_bitcoin_confirmation: hasBitcoin,
    bitcoin_block: bitcoinBlock,
  }
}
