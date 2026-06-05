import type { DatabaseLike } from '../db/driver.js'
import type { Config, StampRecord, StampStatus } from '../types.js'
import { listStamps } from '../db/stamps.js'

type PublicStampRecord = Omit<StampRecord, 'attempt_count' | 'last_attempt_at' | 'next_retry_at'>

function toPublic({ attempt_count: _, last_attempt_at: __, next_retry_at: ___, ...rest }: StampRecord): PublicStampRecord {
  return rest
}

export function listPending(
  input: { status?: StampStatus; limit?: number; offset?: number; older_than_hours?: number; due_now?: boolean },
  db: DatabaseLike,
  _config: Config
) {
  const result = listStamps(db, {
    status: input.status ?? 'pending',
    limit: Math.min(input.limit ?? 50, 200),
    offset: input.offset ?? 0,
    older_than_hours: input.older_than_hours,
    due_now: input.due_now,
  })
  return { items: result.items.map(toPublic), total: result.total }
}
