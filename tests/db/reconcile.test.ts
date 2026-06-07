import { describe, it, expect } from 'vitest'
import { makeRawDb } from '../helpers/db.js'
import { initDb } from '../../src/db/schema.js'
import { insertStamp, getStamp } from '../../src/db/stamps.js'
import { reconcileOrphans } from '../../src/db/index.js'
import { randomUUID } from 'crypto'

describe('reconcileOrphans', () => {
  it('marks pending stamps with a missing proof file as missing_proof, not failed', () => {
    const db = makeRawDb(); initDb(db)
    const id = randomUUID()
    insertStamp(db, { id, hash: 'a'.repeat(64), proof_path: '/nonexistent/path.ots' })
    reconcileOrphans(db)
    expect(getStamp(db, id)?.status).toBe('missing_proof')
  })

  it('leaves pending stamps alone when the proof file exists', () => {
    const db = makeRawDb(); initDb(db)
    const id = randomUUID()
    // schema.test/helper writes proofs under OTS_MCP_DATA_DIR; here use a file we know exists
    insertStamp(db, { id, hash: 'b'.repeat(64), proof_path: process.execPath })
    reconcileOrphans(db)
    expect(getStamp(db, id)?.status).toBe('pending')
  })
})
