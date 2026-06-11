import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// homedir() closure: vitest hoists vi.mock, so the factory runs before beforeEach.
// Returning `() => tmpDir` (a function) makes homedir() read tmpDir at call time,
// so whichever value beforeEach assigns is visible when the test runs.
let tmpDir: string

vi.mock('os', async (importOriginal) => {
  const os = await importOriginal<typeof import('os')>()
  return { ...os, homedir: () => tmpDir }
})

const originalPlatform = process.platform

function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { configurable: true, value: p })
}

function linuxConfigPath(base: string): string {
  return join(base, '.config', 'Claude', 'claude_desktop_config.json')
}
function win32ConfigPath(base: string): string {
  return join(base, 'Claude', 'claude_desktop_config.json')
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ots-setup-claude-'))
  process.env.APPDATA = tmpDir
  process.env.HOME    = tmpDir
})

afterEach(() => {
  setPlatform(originalPlatform)
  delete process.env.APPDATA
  delete process.env.HOME
  rmSync(tmpDir, { recursive: true, force: true })
  vi.clearAllMocks()
})

describe('setupClaude — Linux branch', () => {
  beforeEach(() => setPlatform('linux' as NodeJS.Platform))

  it('creates config file with otskit entry when none exists', async () => {
    const { setupClaude } = await import('../../src/setup/claude.js')
    setupClaude()

    const p = linuxConfigPath(tmpDir)
    expect(existsSync(p)).toBe(true)
    const cfg = JSON.parse(readFileSync(p, 'utf8'))
    expect(cfg.mcpServers?.otskit?.command).toBe('npx')
    expect(cfg.mcpServers?.otskit?.args).toContain('@otskit/mcp')
  })

  it('does not overwrite config when otskit is already present', async () => {
    const p = linuxConfigPath(tmpDir)
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, JSON.stringify({ mcpServers: { otskit: { command: 'existing' } } }), 'utf8')

    const out: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out.push(String(s)); return true })

    const { setupClaude } = await import('../../src/setup/claude.js')
    setupClaude()

    expect(out.join('')).toContain('ya está configurado')
    expect(JSON.parse(readFileSync(p, 'utf8')).mcpServers.otskit.command).toBe('existing')
  })

  it('creates a .bak backup and adds otskit when config exists without it', async () => {
    const p = linuxConfigPath(tmpDir)
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, JSON.stringify({ other: true }), 'utf8')

    const { setupClaude } = await import('../../src/setup/claude.js')
    setupClaude()

    expect(existsSync(p + '.bak')).toBe(true)
    const cfg = JSON.parse(readFileSync(p, 'utf8'))
    expect(cfg.mcpServers?.otskit).toBeDefined()
    expect(cfg.other).toBe(true)
  })

  it('recovers from unparseable existing config and writes a fresh one', async () => {
    const p = linuxConfigPath(tmpDir)
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, '{ not valid json }', 'utf8')

    const { setupClaude } = await import('../../src/setup/claude.js')
    setupClaude()

    const cfg = JSON.parse(readFileSync(p, 'utf8'))
    expect(cfg.mcpServers?.otskit).toBeDefined()
  })
})

describe('setupClaude — Windows branch', () => {
  beforeEach(() => setPlatform('win32' as NodeJS.Platform))

  it('writes config under APPDATA/Claude on Windows', async () => {
    const { setupClaude } = await import('../../src/setup/claude.js')
    setupClaude()

    const p = win32ConfigPath(tmpDir)
    expect(existsSync(p)).toBe(true)
    const cfg = JSON.parse(readFileSync(p, 'utf8'))
    expect(cfg.mcpServers?.otskit?.command).toBe('npx')
  })
})
