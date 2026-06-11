import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { loadConfig, getDataDir } from '../src/config.js'
import { DEFAULT_CALENDARS as DEFAULT_CALENDAR_URLS } from '@otskit/client'

const ORIG = process.env.OTS_MCP_DATA_DIR

function writeConfig(obj: unknown): void {
  const dir = join(tmpdir(), `ots-cfg-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'config.json'), JSON.stringify(obj))
  process.env.OTS_MCP_DATA_DIR = dir
}

beforeEach(() => {
  process.env.OTS_MCP_DATA_DIR = `/tmp/ots-test-${Date.now()}`
})
afterEach(() => {
  if (ORIG === undefined) delete process.env.OTS_MCP_DATA_DIR
  else process.env.OTS_MCP_DATA_DIR = ORIG
})

describe('loadConfig', () => {
  it('returns defaults when no config file exists', () => {
    const config = loadConfig()
    expect(config.stamp_enabled).toBe(true)
    expect(config.calendars).toHaveLength(4)
    expect(config.preserve_whitelist).toEqual([])
    expect(config.preserve_max_bytes).toBe(104_857_600)
  })

  it('getDataDir() respects OTS_MCP_DATA_DIR', () => {
    process.env.OTS_MCP_DATA_DIR = '/custom/path'
    expect(getDataDir()).toBe('/custom/path')
  })

  it('rejects a non-https calendar URL and falls back to defaults', () => {
    writeConfig({ calendars: ['http://evil.internal/'] })
    const cfg = loadConfig()
    expect(cfg.calendars.every(u => u.startsWith('https://'))).toBe(true)
    expect(cfg.calendars).not.toContain('http://evil.internal/')
  })

  it('rejects a calendar host not in the allowlist (SSRF)', () => {
    writeConfig({ calendars: ['https://169.254.169.254/'] })
    const cfg = loadConfig()
    expect(cfg.calendars).not.toContain('https://169.254.169.254/')
  })

  it('rejects unknown config keys and falls back to defaults', () => {
    writeConfig({ totally_unknown_key: 'x' })
    const cfg = loadConfig()
    expect(cfg.calendars).toHaveLength(4)
  })

  it('accepts a valid allowlisted calendar override', () => {
    writeConfig({ calendars: ['https://alice.btc.calendar.opentimestamps.org'] })
    const cfg = loadConfig()
    expect(cfg.calendars).toEqual(['https://alice.btc.calendar.opentimestamps.org'])
  })

  // B1 — the MCP default calendars and host allowlist derive from @otskit/core.
  it('default calendars mirror the canonical core list', () => {
    const cfg = loadConfig()
    expect(cfg.calendars).toEqual([...DEFAULT_CALENDAR_URLS])
  })

  it('falls back to defaults and writes to stderr when config file is invalid JSON', () => {
    const dir = `/tmp/ots-cfg-bad-${Date.now()}`
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'config.json'), '{ not valid json ]')
    process.env.OTS_MCP_DATA_DIR = dir

    const errs: string[] = []
    const orig = process.stderr.write.bind(process.stderr)
    process.stderr.write = (s: any) => { errs.push(String(s)); return true }
    const cfg = loadConfig()
    process.stderr.write = orig

    expect(errs.join('')).toContain('config parse error')
    expect(cfg.stamp_enabled).toBe(true)
  })

  it('every canonical default calendar is itself accepted by the host allowlist', () => {
    for (const url of DEFAULT_CALENDAR_URLS) {
      writeConfig({ calendars: [url] })
      expect(loadConfig().calendars).toEqual([url])
    }
  })
})
