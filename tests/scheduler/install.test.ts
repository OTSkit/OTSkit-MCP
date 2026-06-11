import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
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
  beforeEach(() => setPlatform('win32' as NodeJS.Platform))

  it('writes the Task XML file and calls schtasks /create', async () => {
    const out: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out.push(String(s)); return true })

    await installScheduler([])

    const xmlPath = join(tmpDir, 'ots-mcp-task.xml')
    expect(existsSync(xmlPath)).toBe(true)
    expect(readFileSync(xmlPath, 'utf8')).toContain('<Task')
    expect(execFileSync).toHaveBeenCalledWith(
      'schtasks',
      expect.arrayContaining(['/create', '/tn', 'ots-mcp-check-pending']),
    )
    expect(out.join('')).toContain('Scheduler installed')
  })

  it('uses the --interval argument when provided', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await installScheduler(['--interval', '60'])

    const xmlPath = join(tmpDir, 'ots-mcp-task.xml')
    expect(readFileSync(xmlPath, 'utf8')).toContain('PT60M')
  })

  it('clamps interval: below 1 becomes 1, above 1440 becomes 1440', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await installScheduler(['--interval', '0'])
    expect(readFileSync(join(tmpDir, 'ots-mcp-task.xml'), 'utf8')).toContain('PT1M')

    await installScheduler(['--interval', '9999'])
    expect(readFileSync(join(tmpDir, 'ots-mcp-task.xml'), 'utf8')).toContain('PT1440M')
  })

  it('falls back to 30 minutes when --interval value is not a number', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await installScheduler(['--interval', 'abc'])

    expect(readFileSync(join(tmpDir, 'ots-mcp-task.xml'), 'utf8')).toContain('PT30M')
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
