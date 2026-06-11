import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// homedir() must return tmpDir so the function writes inside our temp directory.
// The vi.mock factory is a lazy closure over `tmpDir`.
let tmpDir: string

import { vi } from 'vitest'
vi.mock('os', async (importOriginal) => {
  const os = await importOriginal<typeof import('os')>()
  return { ...os, homedir: () => tmpDir }
})

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ots-setup-cc-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('setupClaudeCode', () => {
  it('creates ~/.claude.json with otskit entry when none exists', async () => {
    const { setupClaudeCode } = await import('../../src/setup/claude-code.js')
    setupClaudeCode()
    const p = join(tmpDir, '.claude.json')
    expect(existsSync(p)).toBe(true)
    const cfg = JSON.parse(readFileSync(p, 'utf8'))
    expect(cfg.mcpServers?.otskit?.command).toBe('npx')
  })

  it('does not overwrite when otskit is already configured', async () => {
    const p = join(tmpDir, '.claude.json')
    writeFileSync(p, JSON.stringify({ mcpServers: { otskit: { command: 'existing' } } }), 'utf8')

    const out: string[] = []
    const origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = (s: any) => { out.push(String(s)); return true }

    const { setupClaudeCode } = await import('../../src/setup/claude-code.js')
    setupClaudeCode()
    process.stdout.write = origWrite

    expect(out.join('')).toContain('ya está configurado')
    expect(JSON.parse(readFileSync(p, 'utf8')).mcpServers.otskit.command).toBe('existing')
  })

  it('creates backup and adds otskit when config exists without it', async () => {
    const p = join(tmpDir, '.claude.json')
    writeFileSync(p, JSON.stringify({ other: 42 }), 'utf8')

    const { setupClaudeCode } = await import('../../src/setup/claude-code.js')
    setupClaudeCode()

    expect(existsSync(p + '.bak')).toBe(true)
    const cfg = JSON.parse(readFileSync(p, 'utf8'))
    expect(cfg.mcpServers?.otskit).toBeDefined()
    expect(cfg.other).toBe(42)
  })

  it('recovers from an unparseable existing config and writes a fresh one', async () => {
    const p = join(tmpDir, '.claude.json')
    writeFileSync(p, '{ broken json', 'utf8')

    const { setupClaudeCode } = await import('../../src/setup/claude-code.js')
    setupClaudeCode()

    const cfg = JSON.parse(readFileSync(p, 'utf8'))
    expect(cfg.mcpServers?.otskit).toBeDefined()
  })
})
