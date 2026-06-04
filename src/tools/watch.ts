import { getDb } from '../db/index.js'
import { loadConfig } from '../config.js'

export async function watchPending(intervalMinutes: number = 5): Promise<void> {
  const config = loadConfig()
  const db = getDb(config)

  process.stdout.write(`Watching pending stamps every ${intervalMinutes} min. Ctrl+C to stop.\n\n`)

  function tick() {
    const rows = db.prepare(
      `SELECT id, hash, status, attempt_count, bitcoin_block, confirmed_at FROM stamps WHERE status != 'confirmed' ORDER BY created_at DESC`
    ).all() as Array<{ id: string; hash: string; status: string; attempt_count: number; bitcoin_block: number | null; confirmed_at: string | null }>

    const confirmed = db.prepare(`SELECT COUNT(*) as n FROM stamps WHERE status = 'confirmed'`).get() as { n: number }

    process.stdout.write(`${now()} — ${rows.length} pendientes, ${confirmed.n} confirmados\n`)

    for (const row of rows) {
      process.stdout.write(`  ${row.id.slice(0, 8)}  ${row.status}  (${row.attempt_count} intentos)\n`)
    }

    if (rows.length === 0) {
      process.stdout.write(`  (ningún sello pendiente)\n`)
    }

    process.stdout.write('\n')
  }

  function now() {
    return new Date().toISOString().replace('T', ' ').slice(0, 19)
  }

  function loop() {
    tick()
    setTimeout(loop, Math.max(60_000, intervalMinutes * 60 * 1000))
  }

  loop()
}
