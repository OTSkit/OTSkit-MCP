import type { DatabaseLike, SQLiteValue } from './driver.js'
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

export function insertStamp(db: DatabaseLike, params: InsertParams): StampRecord {
  const now = new Date().toISOString()
  db.run(
    `INSERT INTO stamps (id, hash, status, created_at, proof_path, archive_path, attempt_count, metadata)
     VALUES (?, ?, 'pending', ?, ?, ?, 0, ?)`,
    [params.id, params.hash, now, params.proof_path, params.archive_path ?? null, params.metadata ?? null]
  )
  return getStamp(db, params.id)!
}

export function getStamp(db: DatabaseLike, id: string): StampRecord | null {
  return (db.get('SELECT * FROM stamps WHERE id = ?', [id]) as StampRecord | null) ?? null
}

export function updateStampStatus(db: DatabaseLike, id: string, params: UpdateParams): void {
  const fields: string[] = []
  const values: SQLiteValue[] = []

  const add = (col: string, val: SQLiteValue) => { fields.push(`${col} = ?`); values.push(val) }

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
  db.run(`UPDATE stamps SET ${fields.join(', ')} WHERE id = ?`, values)
}

export function listStamps(
  db: DatabaseLike,
  params: { status?: StampStatus; limit: number; offset: number; older_than_hours?: number; due_now?: boolean }
): { items: StampRecord[]; total: number } {
  const conds: string[] = []
  const vals: SQLiteValue[] = []

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
  const countParams = vals.length ? vals : undefined
  const total = (db.get(`SELECT COUNT(*) as n FROM stamps ${where}`, countParams) as { n: number }).n
  const items = db.all(
    `SELECT * FROM stamps ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...vals, params.limit, params.offset]
  ) as StampRecord[]

  return { items, total }
}
