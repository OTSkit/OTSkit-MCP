export type StampStatus = 'pending' | 'confirmed' | 'failed' | 'timeout' | 'missing_proof'
export type OperationAction = 'stamp' | 'upgrade' | 'verify' | 'preserve'
export type OperationResult = 'success' | 'pending' | 'failed'

export interface StampRecord {
  id: string
  hash: string
  status: StampStatus
  created_at: string
  confirmed_at: string | null
  bitcoin_block: number | null
  bitcoin_time: string | null
  proof_path: string | null
  archive_path: string | null
  last_attempt_at: string | null
  attempt_count: number
  last_error: string | null
  next_retry_at: string | null
  metadata: string | null
}

export interface Config {
  stamp_enabled: boolean
  preserve_enabled: boolean
  preserve_whitelist: string[]
  preserve_max_bytes: number
  preserve_max_files: number
  scheduler_interval_minutes: number
  calendar_timeout_ms: number
  retry_max_attempts: number
  log_file: string
  calendars: string[]
}
