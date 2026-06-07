import { readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { z } from 'zod'
import type { Config } from './types.js'

const TRUSTED_CALENDAR_HOSTS = new Set([
  'alice.btc.calendar.opentimestamps.org',
  'bob.btc.calendar.opentimestamps.org',
  'finney.calendar.eternitywall.com',
  'btc.calendar.catallaxy.com',
])

const httpsAllowlisted = (hosts: Set<string>) =>
  z.string().refine(v => {
    try {
      const u = new URL(v)
      return u.protocol === 'https:' && hosts.has(u.hostname)
    } catch {
      return false
    }
  }, { message: 'URL must be https and in the host allowlist' })

const ConfigSchema = z.strictObject({
  stamp_enabled: z.boolean(),
  preserve_enabled: z.boolean(),
  preserve_whitelist: z.array(z.string()),
  preserve_max_bytes: z.number().int().positive().max(10 * 1024 ** 3),
  preserve_max_files: z.number().int().positive().max(100_000),
  scheduler_interval_minutes: z.number().int().min(1).max(1440),
  calendar_timeout_ms: z.number().int().min(1000).max(60_000),
  retry_max_attempts: z.number().int().min(1).max(100),
  log_file: z.string(),
  calendars: z.array(httpsAllowlisted(TRUSTED_CALENDAR_HOSTS)).min(1).max(10),
}).partial()

export function getDataDir(): string {
  return process.env.OTS_MCP_DATA_DIR ?? join(homedir(), '.ots-mcp')
}

const DEFAULTS: Config = {
  stamp_enabled: true,
  preserve_enabled: true,
  preserve_whitelist: [],
  preserve_max_bytes: 104_857_600,
  preserve_max_files: 10_000,
  scheduler_interval_minutes: 30,
  calendar_timeout_ms: 10_000,
  retry_max_attempts: 20,
  log_file: join(getDataDir(), 'ots-mcp.log'),
  calendars: [
    'https://alice.btc.calendar.opentimestamps.org',
    'https://bob.btc.calendar.opentimestamps.org',
    'https://finney.calendar.eternitywall.com',
    'https://btc.calendar.catallaxy.com',
  ],
}

export function loadConfig(): Config {
  const dir = getDataDir()
  mkdirSync(dir, { recursive: true })
  const configPath = join(dir, 'config.json')
  if (!existsSync(configPath)) return { ...DEFAULTS }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8'))
  } catch (e) {
    process.stderr.write(`[ots-mcp] config parse error, using defaults: ${e}\n`)
    return { ...DEFAULTS }
  }
  const parsed = ConfigSchema.safeParse(raw)
  if (!parsed.success) {
    process.stderr.write(`[ots-mcp] config validation failed, using defaults: ${parsed.error.issues[0]?.message}\n`)
    return { ...DEFAULTS }
  }
  return { ...DEFAULTS, ...parsed.data }
}
