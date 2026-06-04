import type { Database } from 'better-sqlite3'
import type { StampRecord, StampStatus } from '../types.js'

interface InsertParams {
  id: string
  hash: string
  proof_path: string
  archive_path?: string
  metadata?: string
}

interface UpdateParams {
  status?: StampStatus
  bitcoin_block?: number
  bitcoin_time?: string
  confirmed_at?: string
  last_error?: string
  attempt_count?: number
  last_attempt_at?: string
  next_retry_at?: string
}

export function insertStamp(db: Database, params: InsertParams): StampRecord {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO stamps (id, hash, status, created_at, proof_path, archive_path, attempt_count, metadata)
    VALUES (?, ?, 'pending', ?, ?, ?, 0, ?)
  `).run(params.id, params.hash, now, params.proof_path, params.archive_path ?? null, params.metadata ?? null)
  return getStamp(db, params.id)!
}

export function getStamp(db: Database, id: string): StampRecord | null {
  return (db.prepare('SELECT * FROM stamps WHERE id = ?').get(id) as StampRecord | undefined) ?? null
}

export function updateStampStatus(db: Database, id: string, params: UpdateParams): void {
  const fields: string[] = []
  const values: unknown[] = []

  const add = (col: string, val: unknown) => { fields.push(`${col} = ?`); values.push(val) }

  if (params.status !== undefined)          add('status', params.status)
  if (params.bitcoin_block !== undefined)   add('bitcoin_block', params.bitcoin_block)
  if (params.bitcoin_time !== undefined)    add('bitcoin_time', params.bitcoin_time)
  if (params.confirmed_at !== undefined)    add('confirmed_at', params.confirmed_at)
  if (params.last_error !== undefined)      add('last_error', params.last_error)
  if (params.attempt_count !== undefined)   add('attempt_count', params.attempt_count)
  if (params.last_attempt_at !== undefined) add('last_attempt_at', params.last_attempt_at)
  if (params.next_retry_at !== undefined)   add('next_retry_at', params.next_retry_at)

  if (fields.length === 0) return
  values.push(id)
  db.prepare(`UPDATE stamps SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function listStamps(
  db: Database,
  params: { status?: StampStatus; limit: number; offset: number; older_than_hours?: number; due_now?: boolean }
): { items: StampRecord[]; total: number } {
  const conds: string[] = []
  const vals: unknown[] = []

  if (params.status) { conds.push('status = ?'); vals.push(params.status) }
  if (params.older_than_hours) {
    const cutoff = new Date(Date.now() - params.older_than_hours * 3_600_000).toISOString()
    conds.push('created_at < ?'); vals.push(cutoff)
  }
  if (params.due_now) {
    conds.push('(next_retry_at IS NULL OR next_retry_at <= ?)')
    vals.push(new Date().toISOString())
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const total = (db.prepare(`SELECT COUNT(*) as n FROM stamps ${where}`).get(...vals) as { n: number }).n
  const items = db.prepare(
    `SELECT * FROM stamps ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...vals, params.limit, params.offset) as StampRecord[]

  return { items, total }
}
