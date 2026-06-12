import { execFileSync } from 'node:child_process'

export async function statusScheduler(): Promise<void> {
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('schtasks', ['/query', '/tn', 'ots-mcp-check-pending', '/fo', 'LIST']).toString()
      process.stdout.write(out + '\n')
    } catch {
      process.stdout.write('Scheduler task not found\n')
    }
  } else {
    process.stdout.write('Check with: crontab -l | grep ots-mcp\n')
  }
}
