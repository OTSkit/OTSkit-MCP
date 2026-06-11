import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return { ...actual, execFileSync: vi.fn() }
})

import { execFileSync } from 'child_process'
import { removeScheduler } from '../../src/scheduler/remove.js'

const originalPlatform = process.platform

function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { configurable: true, value: p })
}

beforeEach(() => {
  vi.mocked(execFileSync).mockReturnValue(Buffer.from(''))
})

afterEach(() => {
  setPlatform(originalPlatform)
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('removeScheduler — Windows', () => {
  beforeEach(() => setPlatform('win32' as NodeJS.Platform))

  it('calls schtasks /delete and reports success to stdout', async () => {
    const out: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out.push(String(s)); return true })

    await removeScheduler()

    expect(execFileSync).toHaveBeenCalledWith(
      'schtasks', ['/delete', '/tn', 'ots-mcp-check-pending', '/f'],
    )
    expect(out.join('')).toContain('removed')
  })

  it('writes error message to stderr without throwing if schtasks fails', async () => {
    vi.mocked(execFileSync).mockImplementationOnce(() => { throw new Error('task not found') })

    const errs: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((s) => { errs.push(String(s)); return true })

    await removeScheduler()

    expect(errs.join('')).toContain('not found')
  })
})

describe('removeScheduler — Linux/macOS', () => {
  beforeEach(() => setPlatform('linux' as NodeJS.Platform))

  it('prints crontab instructions and does not call schtasks', async () => {
    const out: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out.push(String(s)); return true })

    await removeScheduler()

    expect(out.join('')).toContain('crontab')
    expect(execFileSync).not.toHaveBeenCalled()
  })
})
