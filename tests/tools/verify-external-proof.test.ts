import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { verifyExternalProof } from '../../src/tools/verify-external-proof.js'
import type { Config } from '../../src/types.js'

const mockVerify = vi.fn()
vi.mock('@otskit/client', () => ({
  OpenTimestampsClient: vi.fn().mockImplementation(function() {
    return { verify: mockVerify }
  }),
}))

let dir: string
let recordPath: string
let proofPath: string
const RECORD = Buffer.from('{"fixture":"external proof"}\n')
const PROOF = Buffer.from('not a real proof: client is mocked in this unit test')
const HASH = createHash('sha256').update(RECORD).digest('hex')
const FIXTURE_DIR = join(process.cwd(), 'tests/fixtures/external-proof')
const FIXTURE_RECORD = join(FIXTURE_DIR, 'record.json')
const FIXTURE_PROOF = join(FIXTURE_DIR, 'record.json.ots')
const FIXTURE_HASH = 'fbe3c656e8ffc887b321e424fb05770562a6251413c990648b2fbad46f6ebb95'

const config = (): Config => ({
  stamp_enabled: true, preserve_enabled: true, preserve_whitelist: [realpathSync(dir)],
  preserve_max_bytes: 1024, preserve_max_files: 10_000,
  scheduler_interval_minutes: 30, calendar_timeout_ms: 10_000,
  retry_max_attempts: 20, log_file: '/tmp/test.log', calendars: ['https://alice.btc.calendar.opentimestamps.org'],
})

beforeEach(() => {
  vi.clearAllMocks()
  mockVerify.mockReset()
  dir = mkdtempSync(join(tmpdir(), 'ots-external-proof-'))
  recordPath = join(dir, 'record.json')
  proofPath = join(dir, 'record.json.ots')
  writeFileSync(recordPath, RECORD)
  writeFileSync(proofPath, PROOF)
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('verifyExternalProof', () => {
  it('keeps a checked-in external proof fixture with its documented hash', async () => {
    const fixtureConfig = { ...config(), preserve_whitelist: [realpathSync(FIXTURE_DIR)], preserve_max_bytes: 4096 }
    mockVerify.mockResolvedValueOnce({ status: 'verified', blockHeight: 965794, blockTime: 1788707582 })
    const result = await verifyExternalProof({ file_path: FIXTURE_RECORD, proof_path: FIXTURE_PROOF }, fixtureConfig)
    expect(createHash('sha256').update(readFileSync(FIXTURE_RECORD)).digest('hex')).toBe(FIXTURE_HASH)
    expect(mockVerify).toHaveBeenCalledWith(readFileSync(FIXTURE_PROOF), FIXTURE_HASH)
    expect(result).toMatchObject({ status: 'confirmed', hash: FIXTURE_HASH, bitcoin_block: 965794 })
  })

  it('hashes the covered file and returns the same observable fields as a stored verification', async () => {
    mockVerify.mockResolvedValueOnce({ status: 'verified', blockHeight: 965794, blockTime: 1788707582 })
    const result = await verifyExternalProof({ file_path: recordPath, proof_path: proofPath }, config())
    expect(mockVerify).toHaveBeenCalledWith(PROOF, HASH)
    expect(result).toMatchObject({ status: 'confirmed', hash: HASH, bitcoin_block: 965794 })
  })

  it('rejects a one-byte mutation before it can return a Bitcoin attestation', async () => {
    const mutated = Buffer.from(RECORD)
    mutated[0] ^= 1
    writeFileSync(recordPath, mutated)
    const mutatedHash = createHash('sha256').update(mutated).digest('hex')
    mockVerify.mockImplementationOnce(async (_proof, hash) => {
      if (hash !== HASH) return { status: 'invalid', reason: 'File hash does not match proof' }
      return { status: 'verified', blockHeight: 965794, blockTime: 1788707582 }
    })

    const result = await verifyExternalProof({ file_path: recordPath, proof_path: proofPath }, config())
    expect(mutatedHash).not.toBe(HASH)
    expect(result).toMatchObject({ status: 'invalid', hash: mutatedHash, reason: 'File hash does not match proof' })
    expect(result).not.toHaveProperty('bitcoin_block')
    expect(result.status).not.toBe('confirmed')
  })

  it('rejects the checked-in one-byte mutation without a network request', () => {
    const script = `
      import { readFileSync } from 'node:fs'
      import { createHash } from 'node:crypto'
      import { OpenTimestampsClient } from '@otskit/client'
      const record = readFileSync(${JSON.stringify(FIXTURE_RECORD)})
      record[0] ^= 1
      const proof = readFileSync(${JSON.stringify(FIXTURE_PROOF)})
      let calls = 0
      globalThis.fetch = async () => { calls += 1; throw new Error('network must not be called') }
      const hash = createHash('sha256').update(record).digest('hex')
      const result = await new OpenTimestampsClient().verify(proof, hash)
      console.log(JSON.stringify({ status: result.status, calls }))
    `
    const output = execFileSync(process.execPath, ['--input-type=module', '--eval', script], { encoding: 'utf8' })
    expect(JSON.parse(output)).toEqual({ status: 'invalid', calls: 0 })
  })

  it('does not call the verifier for a file outside the whitelist', async () => {
    const outside = join(tmpdir(), `ots-external-outside-${Date.now()}.json`)
    writeFileSync(outside, RECORD)
    try {
      const result = await verifyExternalProof({ file_path: outside, proof_path: proofPath }, config())
      expect(result).toMatchObject({ error: 'path_not_allowed' })
      expect(mockVerify).not.toHaveBeenCalled()
    } finally {
      rmSync(outside, { force: true })
    }
  })

  it('rejects an oversized proof before reading or verifying it', async () => {
    writeFileSync(proofPath, Buffer.alloc(1_048_577))
    const result = await verifyExternalProof({ file_path: recordPath, proof_path: proofPath }, config())
    expect(result).toMatchObject({ error: 'file_too_large' })
    expect(mockVerify).not.toHaveBeenCalled()
  })

  it('maps verifier network errors without changing local state', async () => {
    mockVerify.mockRejectedValueOnce(new Error('explorer unavailable'))
    const result = await verifyExternalProof({ file_path: recordPath, proof_path: proofPath }, config())
    expect(result).toMatchObject({ status: 'network_error', hash: HASH, details: 'Error: explorer unavailable' })
  })
})
