import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// install-claude uses process.env.HOME (Linux/macOS) and process.env.APPDATA (Windows)
// to compute the config path — controlling those env vars is enough; no os mock needed.

let tmpDir: string
const originalPlatform = process.platform

function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { configurable: true, value: p })
}

function configPath(base: string, platform = process.platform): string {
  if (platform === 'win32') return join(base, 'Claude', 'claude_desktop_config.json')
  if (platform === 'darwin') return join(base, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
  return join(base, '.config', 'Claude', 'claude_desktop_config.json')
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ots-install-claude-'))
  process.env.HOME = tmpDir
  process.env.APPDATA = tmpDir
  setPlatform('linux' as NodeJS.Platform)
})

afterEach(() => {
  setPlatform(originalPlatform)
  delete process.env.HOME
  delete process.env.APPDATA
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('installClaude', () => {
  it('creates the config file with an otskit entry when none exists', async () => {
    const { installClaude } = await import('../src/install-claude.js')
    installClaude()
    const p = configPath(tmpDir)
    expect(existsSync(p)).toBe(true)
    const cfg = JSON.parse(readFileSync(p, 'utf8'))
    expect(cfg.mcpServers?.otskit?.command).toBe('npx')
    expect(cfg.mcpServers?.otskit?.args).toContain('@otskit/mcp')
  })

  it('merges otskit into an existing config without losing other keys', async () => {
    const p = configPath(tmpDir)
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, JSON.stringify({ other: 'data', mcpServers: { other_tool: {} } }), 'utf8')

    const { installClaude } = await import('../src/install-claude.js')
    installClaude()

    const cfg = JSON.parse(readFileSync(p, 'utf8'))
    expect(cfg.other).toBe('data')
    expect(cfg.mcpServers.other_tool).toBeDefined()
    expect(cfg.mcpServers.otskit).toBeDefined()
  })

  it('overwrites an unparseable config and writes a fresh one with otskit', async () => {
    const p = configPath(tmpDir)
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, 'this is not json', 'utf8')

    const errs: string[] = []
    const origWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = (s: any) => { errs.push(String(s)); return true }

    const { installClaude } = await import('../src/install-claude.js')
    installClaude()
    process.stderr.write = origWrite

    expect(errs.join('')).toContain('Warning')
    const cfg = JSON.parse(readFileSync(p, 'utf8'))
    expect(cfg.mcpServers?.otskit).toBeDefined()
  })

  it('writes config under APPDATA/Claude on Windows', async () => {
    setPlatform('win32' as NodeJS.Platform)
    const { installClaude } = await import('../src/install-claude.js')
    installClaude()
    const p = configPath(tmpDir, 'win32' as NodeJS.Platform)
    expect(existsSync(p)).toBe(true)
  })

  it('writes config under Library/Application Support on macOS', async () => {
    setPlatform('darwin' as NodeJS.Platform)
    const { installClaude } = await import('../src/install-claude.js')
    installClaude()
    const p = configPath(tmpDir, 'darwin' as NodeJS.Platform)
    expect(existsSync(p)).toBe(true)
    const cfg = JSON.parse(readFileSync(p, 'utf8'))
    expect(cfg.mcpServers?.otskit?.command).toBe('npx')
  })
})
