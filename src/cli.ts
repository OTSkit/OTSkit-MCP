import { getDb, backupDb } from './db/index.js'
import { loadConfig } from './config.js'
import { createTimestamp } from './tools/create-timestamp.js'
import { upgradeTimestamp } from './tools/upgrade-timestamp.js'
import { verifyTimestamp } from './tools/verify-timestamp.js'
import { listPending } from './tools/list-pending.js'
import type { StampStatus } from './types.js'

export async function runCli(command: string, args: string[]): Promise<void> {
  const config = loadConfig()
  const db = getDb()

  switch (command) {
    case 'stamp': {
      const hash = args[0]
      if (!hash) { process.stderr.write('Usage: ots-mcp stamp <sha256-hash>\n'); process.exit(1) }
      const result = await createTimestamp({ hash }, db, config)
      if ('error' in result) { process.stderr.write(`Error: ${result.error} — ${result.details}\n`); process.exit(1) }
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      break
    }
    case 'upgrade': {
      const id = args[0]
      if (!id) { process.stderr.write('Usage: ots-mcp upgrade <id>\n'); process.exit(1) }
      const result = await upgradeTimestamp({ id }, db, config)
      if ('error' in result) { process.stderr.write(`Error: ${result.error} — ${result.details}\n`); process.exit(1) }
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      break
    }
    case 'verify': {
      const id = args[0]
      if (!id) { process.stderr.write('Usage: ots-mcp verify <id>\n'); process.exit(1) }
      const result = await verifyTimestamp({ id }, db, config)
      if ('error' in result) { process.stderr.write(`Error: ${result.error} — ${result.details}\n`); process.exit(1) }
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      break
    }
    case 'list': {
      const status = (args[0] ?? 'pending') as StampStatus
      const result = listPending({ status }, db, config)
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      break
    }
    case 'check-pending': {
      const { items } = listPending({ status: 'pending', limit: 200 }, db, config)
      process.stderr.write(`Processing ${items.length} pending stamps...\n`)
      for (const record of items) {
        const result = await upgradeTimestamp({ id: record.id }, db, config)
        const statusStr = 'status' in result ? result.status : `error:${result.error}`
        process.stderr.write(`${record.id.slice(0, 8)}: ${statusStr}\n`)
      }
      process.exit(0)
    }
    case 'backup': {
      const dest = args[0] ?? `ots-mcp-backup-${Date.now()}.sqlite`
      backupDb(dest)
      process.stdout.write(`Backup saved to ${dest}\n`)
      break
    }
    case 'scheduler': {
      const { runScheduler } = await import('./scheduler/index.js')
      await runScheduler(args)
      break
    }
  }
}
