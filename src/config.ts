import { readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { Config } from './types.js'

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
  calendar_max_response_bytes: 1_048_576,
  retry_max_attempts: 20,
  log_file: join(getDataDir(), 'ots-mcp.log'),
  calendars: [
    'https://alice.btc.calendar.opentimestamps.org',
    'https://bob.btc.calendar.opentimestamps.org',
    'https://finney.calendar.eternitywall.com',
    'https://btc.calendar.catallaxy.com',
  ],
  esplora_url: 'https://blockstream.info/api',
}

export function loadConfig(): Config {
  const dir = getDataDir()
  mkdirSync(dir, { recursive: true })
  const configPath = join(dir, 'config.json')
  if (!existsSync(configPath)) return { ...DEFAULTS }
  const raw = JSON.parse(readFileSync(configPath, 'utf8'))
  return { ...DEFAULTS, ...raw }
}
