import type { Database } from 'better-sqlite3'
import type { Config, StampStatus } from '../types.js'
import { listStamps } from '../db/stamps.js'

export function listPending(
  input: { status?: StampStatus; limit?: number; offset?: number; older_than_hours?: number },
  db: Database,
  _config: Config
) {
  return listStamps(db, {
    status: input.status ?? 'pending',
    limit: Math.min(input.limit ?? 50, 200),
    offset: input.offset ?? 0,
    older_than_hours: input.older_than_hours,
  })
}
