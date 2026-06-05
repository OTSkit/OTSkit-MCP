import type { DatabaseLike } from './driver.js'
import type { OperationAction, OperationResult } from '../types.js'

export function logOperation(
  db: DatabaseLike,
  params: {
    stamp_id: string
    action: OperationAction
    result: OperationResult
    error_msg?: string
    calendar_uri?: string
    response_time_ms?: number
  }
): void {
  db.run(
    `INSERT INTO operations_log (stamp_id, action, result, error_msg, calendar_uri, response_time_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      params.stamp_id, params.action, params.result,
      params.error_msg ?? null, params.calendar_uri ?? null,
      params.response_time_ms ?? null, new Date().toISOString()
    ]
  )
}
