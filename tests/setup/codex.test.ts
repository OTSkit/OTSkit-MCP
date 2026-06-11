import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { vi } from 'vitest'

let tmpDir: string

vi.mock('os', async (importOriginal) => {
  const os = await importOriginal<typeof import('os')>()
  return { ...os, homedir: () => tmpDir }
})

const BLOCK = `\n[mcp_servers.ots-mcp]\ncommand = "npx"\nargs = ["-y", "@otskit/mcp", "serve"]\n`

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ots-setup-codex-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('setupCodex', () => {
  it('creates ~/.codex/config.toml with the MCP block when none exists', async () => {
    const { setupCodex } = await import('../../src/setup/codex.js')
    setupCodex()
    const p = join(tmpDir, '.codex', 'config.toml')
    expect(existsSync(p)).toBe(true)
    expect(readFileSync(p, 'utf8')).toContain('[mcp_servers.ots-mcp]')
  })

  it('does not modify config when ots-mcp is already present', async () => {
    const configDir = join(tmpDir, '.codex')
    mkdirSync(configDir, { recursive: true })
    const p = join(configDir, 'config.toml')
    const original = `[settings]\nkey = "value"\n${BLOCK}`
    writeFileSync(p, original, 'utf8')

    const out: string[] = []
    const origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = (s: any) => { out.push(String(s)); return true }

    const { setupCodex } = await import('../../src/setup/codex.js')
    setupCodex()
    process.stdout.write = origWrite

    expect(out.join('')).toContain('ya está configurado')
    // File content must be identical to original
    expect(readFileSync(p, 'utf8')).toBe(original)
  })

  it('creates backup and appends the MCP block to existing TOML', async () => {
    const configDir = join(tmpDir, '.codex')
    mkdirSync(configDir, { recursive: true })
    const p = join(configDir, 'config.toml')
    writeFileSync(p, '[settings]\nkey = "value"\n', 'utf8')

    const { setupCodex } = await import('../../src/setup/codex.js')
    setupCodex()

    expect(existsSync(p + '.bak')).toBe(true)
    const content = readFileSync(p, 'utf8')
    expect(content).toContain('[settings]')
    expect(content).toContain('[mcp_servers.ots-mcp]')
  })

  it('creates the config from scratch when the directory does not exist yet', async () => {
    // tmpDir has no .codex dir at all
    const { setupCodex } = await import('../../src/setup/codex.js')
    setupCodex()
    const p = join(tmpDir, '.codex', 'config.toml')
    expect(existsSync(p)).toBe(true)
    expect(readFileSync(p, 'utf8')).toContain('[mcp_servers.ots-mcp]')
  })
})
