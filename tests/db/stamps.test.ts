import { describe, it, expect, beforeEach } from 'vitest'
import { makeRawDb } from '../helpers/db.js'
import type { DatabaseLike } from '../../src/db/driver.js'
import { initDb } from '../../src/db/schema.js'
import { insertStamp, getStamp, updateStampStatus, listStamps } from '../../src/db/stamps.js'

let db: DatabaseLike

beforeEach(() => {
  db = makeRawDb()
  initDb(db)
})

describe('insertStamp', () => {
  it('inserts with status pending and attempt_count 0', () => {
    const r = insertStamp(db, { id: 'id-1', hash: 'a'.repeat(64), proof_path: '/tmp/1.ots' })
    expect(r.status).toBe('pending')
    expect(r.attempt_count).toBe(0)
    expect(r.hash).toBe('a'.repeat(64))
  })
})

describe('getStamp', () => {
  it('returns null for unknown id', () => {
    expect(getStamp(db, 'nonexistent')).toBeNull()
  })
  it('returns inserted record', () => {
    insertStamp(db, { id: 'id-2', hash: 'b'.repeat(64), proof_path: '/tmp/2.ots' })
    expect(getStamp(db, 'id-2')?.hash).toBe('b'.repeat(64))
  })
})

describe('updateStampStatus', () => {
  it('updates to confirmed with bitcoin fields', () => {
    insertStamp(db, { id: 'id-3', hash: 'c'.repeat(64), proof_path: '/tmp/3.ots' })
    updateStampStatus(db, 'id-3', {
      status: 'confirmed',
      bitcoin_block: 800_000,
      bitcoin_time: '2024-01-01T00:00:00.000Z',
      confirmed_at: new Date().toISOString(),
    })
    const r = getStamp(db, 'id-3')!
    expect(r.status).toBe('confirmed')
    expect(r.bitcoin_block).toBe(800_000)
  })
})

describe('listStamps', () => {
  it('filters by status', () => {
    insertStamp(db, { id: 'p1', hash: 'a'.repeat(64), proof_path: '/tmp/p1.ots' })
    insertStamp(db, { id: 'p2', hash: 'b'.repeat(64), proof_path: '/tmp/p2.ots' })
    updateStampStatus(db, 'p2', {
      status: 'confirmed', bitcoin_block: 1,
      bitcoin_time: '2024-01-01T00:00:00.000Z', confirmed_at: new Date().toISOString()
    })
    const result = listStamps(db, { status: 'pending', limit: 50, offset: 0 })
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(result.items[0].id).toBe('p1')
  })
})
