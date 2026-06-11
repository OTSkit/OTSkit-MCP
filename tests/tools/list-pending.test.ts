import { describe, it, expect, beforeEach } from 'vitest'
import { makeRawDb } from '../helpers/db.js'
import type { DatabaseLike } from '../../src/db/driver.js'
import { initDb } from '../../src/db/schema.js'
import { insertStamp, updateStampStatus } from '../../src/db/stamps.js'
import { listPending } from '../../src/tools/list-pending.js'
import type { Config } from '../../src/types.js'

const MOCK_CONFIG: Config = {
  stamp_enabled: true, preserve_enabled: true, preserve_whitelist: [],
  preserve_max_bytes: 104_857_600, preserve_max_files: 10_000,
  scheduler_interval_minutes: 30, calendar_timeout_ms: 10_000,
  retry_max_attempts: 20, log_file: '/tmp/test.log',
  calendars: ['https://alice.btc.calendar.opentimestamps.org'],
}

let db: DatabaseLike

beforeEach(() => {
  db = makeRawDb()
  initDb(db)
})

describe('listPending', () => {
  it('returns empty list and zero total when DB is empty', () => {
    const result = listPending({}, db, MOCK_CONFIG)
    expect(result.items).toHaveLength(0)
    expect(result.total).toBe(0)
  })

  it('returns pending stamps with correct id and hash', () => {
    insertStamp(db, { id: 'p1', hash: 'a'.repeat(64), proof_path: '/tmp/a.ots' })
    const result = listPending({ status: 'pending' }, db, MOCK_CONFIG)
    expect(result.total).toBe(1)
    expect(result.items[0].id).toBe('p1')
    expect(result.items[0].hash).toBe('a'.repeat(64))
  })

  it('strips internal fields not meant for callers', () => {
    insertStamp(db, { id: 'p2', hash: 'b'.repeat(64), proof_path: '/tmp/b.ots' })
    const item = listPending({}, db, MOCK_CONFIG).items[0]
    expect(item).not.toHaveProperty('attempt_count')
    expect(item).not.toHaveProperty('last_attempt_at')
    expect(item).not.toHaveProperty('next_retry_at')
    expect(item).not.toHaveProperty('proof_path')
    expect(item).not.toHaveProperty('archive_path')
  })

  it('filters by status — confirmed stamps excluded from pending query', () => {
    insertStamp(db, { id: 'p3', hash: 'c'.repeat(64), proof_path: '/tmp/c.ots' })
    insertStamp(db, { id: 'p4', hash: 'd'.repeat(64), proof_path: '/tmp/d.ots' })
    updateStampStatus(db, 'p4', {
      status: 'confirmed', bitcoin_block: 1,
      bitcoin_time: '2024-01-01T00:00:00.000Z', confirmed_at: new Date().toISOString(),
    })

    const result = listPending({ status: 'pending' }, db, MOCK_CONFIG)
    expect(result.total).toBe(1)
    expect(result.items[0].id).toBe('p3')
  })

  it('caps the limit at 200 regardless of input', () => {
    // Insert 3 stamps and request 9999 — result must be ≤ 200
    for (let i = 0; i < 3; i++) {
      insertStamp(db, { id: `cap-${i}`, hash: String(i).padStart(64, '0'), proof_path: '/tmp/x.ots' })
    }
    const result = listPending({ limit: 9999 }, db, MOCK_CONFIG)
    expect(result.items.length).toBeLessThanOrEqual(200)
    expect(result.total).toBe(3)
  })

  it('respects offset for pagination', () => {
    insertStamp(db, { id: 'pg-a', hash: 'a'.repeat(64), proof_path: '/tmp/a.ots' })
    insertStamp(db, { id: 'pg-b', hash: 'b'.repeat(64), proof_path: '/tmp/b.ots' })
    const result = listPending({ limit: 10, offset: 1 }, db, MOCK_CONFIG)
    expect(result.items).toHaveLength(1)
  })

  it('filters by older_than_hours — only returns stamps older than the cutoff', () => {
    insertStamp(db, { id: 'old-1', hash: 'e'.repeat(64), proof_path: '/tmp/e.ots' })
    // backdate the stamp to 25 hours ago
    const old = new Date(Date.now() - 25 * 3_600_000).toISOString()
    db.run('UPDATE stamps SET created_at = ? WHERE id = ?', [old, 'old-1'])

    insertStamp(db, { id: 'new-1', hash: 'f'.repeat(64), proof_path: '/tmp/f.ots' })
    // new-1 has a fresh timestamp — should NOT match

    const result = listPending({ older_than_hours: 24 }, db, MOCK_CONFIG)
    expect(result.total).toBe(1)
    expect(result.items[0].id).toBe('old-1')
  })

  it('filters by due_now — only returns stamps where next_retry_at is past or null', () => {
    insertStamp(db, { id: 'due-now', hash: 'g'.repeat(64), proof_path: '/tmp/g.ots' })
    // next_retry_at IS NULL → due immediately

    insertStamp(db, { id: 'not-due', hash: 'h'.repeat(64), proof_path: '/tmp/h.ots' })
    const future = new Date(Date.now() + 3_600_000).toISOString()
    db.run('UPDATE stamps SET next_retry_at = ? WHERE id = ?', [future, 'not-due'])

    const result = listPending({ due_now: true }, db, MOCK_CONFIG)
    expect(result.total).toBe(1)
    expect(result.items[0].id).toBe('due-now')
  })
})
