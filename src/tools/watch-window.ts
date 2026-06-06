import { exec } from 'child_process'
import { normalizeWatchInterval } from './watch.js'

export function openWatchWindow(intervalMinutes?: number): { opened: boolean; interval_minutes: number; error?: string } {
  const minutes = normalizeWatchInterval(intervalMinutes)
  const cmd = `start powershell.exe -NoExit -Command "ots-mcp watch ${minutes}"`
  let errorMsg: string | undefined
  exec(cmd, { shell: 'cmd' }, (err) => {
    if (err) errorMsg = err.message
  })
  return { opened: true, interval_minutes: minutes, ...(errorMsg ? { error: errorMsg } : {}) }
}
