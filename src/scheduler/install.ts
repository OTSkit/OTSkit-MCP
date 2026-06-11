import { execFileSync } from 'child_process'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { which, escapeXml } from '../utils.js'

export async function installScheduler(args: string[]): Promise<void> {
  const intervalIdx = args.indexOf('--interval')
  const parsedInterval = intervalIdx !== -1 ? parseInt(args[intervalIdx + 1] ?? '30') : 30
  const interval = Math.max(1, Math.min(1440, Number.isFinite(parsedInterval) ? parsedInterval : 30))
  const bin = which('ots-mcp') ?? process.argv[1]

  if (process.platform === 'win32') {
    const xmlPath = join(process.env.TEMP ?? '', 'ots-mcp-task.xml')
    writeFileSync(xmlPath, `<?xml version="1.0"?>
<Task xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers><TimeTrigger>
    <Repetition><Interval>PT${interval}M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition>
    <StartBoundary>2020-01-01T00:00:00</StartBoundary><Enabled>true</Enabled>
  </TimeTrigger></Triggers>
  <Actions><Exec>
    <Command>${escapeXml(bin)}</Command>
    <Arguments>check-pending</Arguments>
  </Exec></Actions>
</Task>`)
    execFileSync('schtasks', ['/create', '/tn', 'ots-mcp-check-pending', '/xml', xmlPath, '/f'])
    process.stdout.write(`Scheduler installed: runs every ${interval} minutes\n`)
  } else {
    process.stdout.write(`Add to crontab (run: crontab -e):\n`)
    process.stdout.write(`*/${interval} * * * * "${bin}" check-pending\n`)
  }
}
