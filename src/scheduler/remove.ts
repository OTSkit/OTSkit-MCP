import { execFileSync } from 'node:child_process'

export async function removeScheduler(): Promise<void> {
  if (process.platform === 'win32') {
    try {
      execFileSync('schtasks', ['/delete', '/tn', 'ots-mcp-check-pending', '/f'])
      process.stdout.write('Scheduler task removed\n')
    } catch {
      process.stderr.write('Task not found or could not be removed\n')
    }
  } else {
    process.stdout.write('Remove the ots-mcp entry from crontab: crontab -e\n')
  }
}
