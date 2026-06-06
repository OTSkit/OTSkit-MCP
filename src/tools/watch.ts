import { getDb } from '../db/index.js'
import { loadConfig } from '../config.js'
import { upgradeTimestamp } from './upgrade-timestamp.js'

const DEFAULT_WATCH_INTERVAL_MINUTES = 30
const MIN_WATCH_INTERVAL_MINUTES = 15
const MAX_UPGRADES_PER_TICK = 20

export function normalizeWatchInterval(intervalMinutes: number = DEFAULT_WATCH_INTERVAL_MINUTES): number {
  if (!Number.isFinite(intervalMinutes)) return DEFAULT_WATCH_INTERVAL_MINUTES
  return Math.max(MIN_WATCH_INTERVAL_MINUTES, Math.floor(intervalMinutes))
}

export async function watchPending(intervalMinutes: number = DEFAULT_WATCH_INTERVAL_MINUTES): Promise<void> {
  const config = loadConfig()
  const db = getDb()
  const minutes = normalizeWatchInterval(intervalMinutes)

  process.stdout.write(`Watching pending stamps and upgrading due proofs every ${minutes} min. Ctrl+C to stop.\n\n`)

  async function tick() {
    const dueRows = db.all(
      `SELECT id FROM stamps
       WHERE status = 'pending'
         AND (next_retry_at IS NULL OR next_retry_at <= ?)
       ORDER BY created_at ASC
       LIMIT ?`,
      [new Date().toISOString(), MAX_UPGRADES_PER_TICK]
    ) as Array<{ id: string }>

    if (dueRows.length > 0) {
      process.stdout.write(`${now()} - upgrading ${dueRows.length} due stamp(s)\n`)
    }

    for (const row of dueRows) {
      const result = await upgradeTimestamp({ id: row.id }, db, config)
      const status = 'status' in result ? result.status : `error:${result.error}`
      process.stdout.write(`  upgrade ${row.id.slice(0, 8)} -> ${status}\n`)
    }

    const rows = db.all(
      `SELECT id, hash, status, attempt_count, bitcoin_block, confirmed_at, next_retry_at
       FROM stamps
       WHERE status != 'confirmed'
       ORDER BY created_at DESC`
    ) as Array<{
      id: string
      hash: string
      status: string
      attempt_count: number
      bitcoin_block: number | null
      confirmed_at: string | null
      next_retry_at: string | null
    }>

    const confirmed = db.get(`SELECT COUNT(*) as n FROM stamps WHERE status = 'confirmed'`) as { n: number }

    process.stdout.write(`${now()} - ${rows.length} pending, ${confirmed.n} confirmed\n`)

    for (const row of rows) {
      const next = row.next_retry_at ? ` next ${row.next_retry_at.replace('T', ' ').slice(0, 19)}` : ''
      process.stdout.write(`  ${row.id.slice(0, 8)}  ${row.status}  (${row.attempt_count} attempts)${next}\n`)
    }

    if (rows.length === 0) {
      process.stdout.write(`  (no pending stamps)\n`)
    }

    process.stdout.write('\n')
  }

  function now() {
    return new Date().toISOString().replace('T', ' ').slice(0, 19)
  }

  async function loop() {
    try {
      await tick()
    } catch (e) {
      process.stderr.write(`watch error: ${String(e)}\n`)
    }
    setTimeout(loop, minutes * 60 * 1000)
  }

  await loop()
}
