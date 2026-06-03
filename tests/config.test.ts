import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadConfig, getDataDir } from '../src/config.js'

const ORIG = process.env.OTS_MCP_DATA_DIR

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
})
