import { getDb } from '../db/index.js'
import { loadConfig } from '../config.js'
import { upgradeTimestamp } from './upgrade-timestamp.js'

export async function watchPending(intervalMinutes: number = 5): Promise<void> {
  const config = loadConfig()
  const db = getDb(config)

  process.stdout.write(`Watching pending stamps every ${intervalMinutes} min. Ctrl+C to stop.\n\n`)

  async function tick() {
    const rows = db.prepare(`SELECT id, hash, status FROM stamps WHERE status = 'pending'`).all() as Array<{id: string, hash: string, status: string}>

    if (rows.length === 0) {
      process.stdout.write(`${now()} All stamps confirmed.\n`)
      process.exit(0)
    }

    process.stdout.write(`${now()} Checking ${rows.length} pending stamps...\n`)

    for (const row of rows) {
      const result = await upgradeTimestamp({ id: row.id }, db, config)
      if ('error' in result) {
        process.stdout.write(`  ${row.id.slice(0,8)}... ERROR: ${result.error}\n`)
      } else if (result.status === 'confirmed') {
        process.stdout.write(`  ${row.id.slice(0,8)}... CONFIRMED block #${(result as any).bitcoin_block}\n`)
      } else {
        process.stdout.write(`  ${row.id.slice(0,8)}... pending (attempt ${(result as any).attempt_count})\n`)
      }
    }
    process.stdout.write('\n')
  }

  function now() {
    return new Date().toISOString().replace('T', ' ').slice(0, 19)
  }

  await tick()
  setInterval(tick, intervalMinutes * 60 * 1000)
}
