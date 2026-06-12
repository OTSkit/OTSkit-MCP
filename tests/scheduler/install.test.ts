import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'fs'
import { join, dirname, basename } from 'path'
import { tmpdir } from 'os'

// No external const variables — factories are hoisted before const declarations.
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return { ...actual, execFileSync: vi.fn() }
})

import { execFileSync } from 'child_process'
import { installScheduler } from '../../src/scheduler/install.js'

const originalPlatform = process.platform

function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { configurable: true, value: p })
}

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ots-scheduler-install-'))
  process.env.TEMP = tmpDir
  // 'where' (Windows) / 'which' (Unix) call inside which() — return a fake binary path
  vi.mocked(execFileSync).mockImplementation((cmd: any) => {
    if (cmd === 'where' || cmd === 'which') return Buffer.from('/fake/ots-mcp')
    return Buffer.from('')
  })
})

afterEach(() => {
  setPlatform(originalPlatform)
  delete process.env.TEMP
  rmSync(tmpDir, { recursive: true, force: true })
  vi.clearAllMocks()
})

describe('installScheduler — Windows', () => {
  // The XML file is deleted before installScheduler returns, so its content
  // is captured at the moment schtasks reads it.
  let capturedXml: { path: string; content: string } | null

  beforeEach(() => {
    setPlatform('win32' as NodeJS.Platform)
    capturedXml = null
    vi.mocked(execFileSync).mockImplementation((cmd: any, cmdArgs?: any) => {
      if (cmd === 'where' || cmd === 'which') return Buffer.from('/fake/ots-mcp')
      if (cmd === 'schtasks') {
        const xmlPath = cmdArgs[cmdArgs.indexOf('/xml') + 1]
        capturedXml = { path: xmlPath, content: readFileSync(xmlPath, 'utf8') }
      }
      return Buffer.from('')
    })
  })

  it('writes the Task XML in a private random temp dir and calls schtasks /create', async () => {
    const out: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out.push(String(s)); return true })

    await installScheduler([])

    expect(capturedXml).not.toBeNull()
    expect(capturedXml!.content).toContain('<Task')
    // Random per-invocation directory, not a predictable path in the shared temp dir
    expect(dirname(capturedXml!.path)).not.toBe(tmpDir)
    expect(basename(dirname(capturedXml!.path))).toMatch(/^ots-mcp-/)
    expect(execFileSync).toHaveBeenCalledWith(
      'schtasks',
      expect.arrayContaining(['/create', '/tn', 'ots-mcp-check-pending']),
    )
    expect(out.join('')).toContain('Scheduler installed')
  })

  it('cleans up the XML file and its temp dir after installing', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await installScheduler([])

    expect(capturedXml).not.toBeNull()
    expect(existsSync(capturedXml!.path)).toBe(false)
    expect(existsSync(dirname(capturedXml!.path))).toBe(false)
  })

  it('cleans up the temp dir even when schtasks fails', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.mocked(execFileSync).mockImplementation((cmd: any) => {
      if (cmd === 'where' || cmd === 'which') return Buffer.from('/fake/ots-mcp')
      if (cmd === 'schtasks') throw new Error('schtasks failed')
      return Buffer.from('')
    })

    await expect(installScheduler([])).rejects.toThrow('schtasks failed')
    // No leftover directories in the temp root
    expect(readdirSync(tmpDir)).toEqual([])
  })

  it('uses the --interval argument when provided', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await installScheduler(['--interval', '60'])

    expect(capturedXml!.content).toContain('PT60M')
  })

  it('clamps interval: below 1 becomes 1, above 1440 becomes 1440', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await installScheduler(['--interval', '0'])
    expect(capturedXml!.content).toContain('PT1M')

    await installScheduler(['--interval', '9999'])
    expect(capturedXml!.content).toContain('PT1440M')
  })

  it('falls back to 30 minutes when --interval value is not a number', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await installScheduler(['--interval', 'abc'])

    expect(capturedXml!.content).toContain('PT30M')
  })
})

describe('installScheduler — Linux/macOS', () => {
  beforeEach(() => setPlatform('linux' as NodeJS.Platform))

  it('prints crontab instructions and does not call schtasks', async () => {
    const out: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out.push(String(s)); return true })

    await installScheduler([])

    expect(out.join('')).toContain('crontab')
    expect(execFileSync).not.toHaveBeenCalledWith('schtasks', expect.anything())
  })
})
