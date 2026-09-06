import { readFileSync, statSync } from 'node:fs'
import { OpenTimestampsClient } from '@otskit/client'
import type { VerificationResult } from '@otskit/client'
import { hashFileStreaming, validateFilePath } from '../utils.js'
import type { Config } from '../types.js'

// OTS receipts are normally kilobytes. Keep their limit independent from the
// large preservation cap used for covered source files, because this tool reads
// the receipt into memory before the parser receives it.
const MAX_EXTERNAL_PROOF_BYTES = 1 * 1024 * 1024

type VerifyExternalProofResult =
  | { status: 'confirmed'; hash: string; bitcoin_block: number; bitcoin_time: string }
  | { status: 'pending'; hash: string; calendars: string[] }
  | { status: 'invalid'; hash: string; reason: string }
  | { status: 'network_error'; hash: string; details: string }
  | { error: 'invalid_path' | 'path_not_allowed' | 'not_a_regular_file' | 'file_too_large'; details: string }

/**
 * Verifies a caller-provided proof without consulting or changing OTSkit's
 * local stamp store. Both files pass the same whitelist and size limits as
 * preservation-related file tools before either is read.
 */
export async function verifyExternalProof(
  input: { file_path: string; proof_path: string },
  config: Config
): Promise<VerifyExternalProofResult> {
  const file = validateFilePath(input.file_path, config.preserve_whitelist)
  if ('error' in file) return file
  const proof = validateFilePath(input.proof_path, config.preserve_whitelist)
  if ('error' in proof) return proof

  // Reject oversize proof input before loading it or contacting a verifier.
  if (statSync(proof.path).size > MAX_EXTERNAL_PROOF_BYTES) {
    return { error: 'file_too_large', details: `proof exceeds ${MAX_EXTERNAL_PROOF_BYTES} bytes` }
  }

  let hash: string
  try {
    hash = await hashFileStreaming(file.path, config.preserve_max_bytes)
  } catch (e: any) {
    if (String(e?.message).startsWith('file_too_large')) {
      return { error: 'file_too_large', details: e.message }
    }
    throw e
  }

  const proofBytes = readFileSync(proof.path)
  const client = new OpenTimestampsClient({
    calendars: config.calendars,
    resilience: {
      totalTimeoutMs: config.calendar_timeout_ms,
      connectTimeoutMs: Math.min(config.calendar_timeout_ms, 5000),
      retries: { enabled: true, maxAttempts: config.retry_max_attempts, backoff: { strategy: 'exponential', initialDelayMs: 500, jitter: 'full' } },
    },
  })

  let result: VerificationResult
  try {
    result = await client.verify(proofBytes, hash)
  } catch (e) {
    return { status: 'network_error', hash, details: String(e) }
  }

  switch (result.status) {
    case 'verified':
      return { status: 'confirmed', hash, bitcoin_block: result.blockHeight, bitcoin_time: new Date(result.blockTime * 1000).toISOString() }
    case 'pending':
      return { status: 'pending', hash, calendars: config.calendars }
    case 'invalid':
      return { status: 'invalid', hash, reason: result.reason }
    case 'network_error':
      return { status: 'network_error', hash, details: result.reason }
    /* c8 ignore next 4 */
    default: {
      const _exhaustive: never = result
      return _exhaustive
    }
  }
}
