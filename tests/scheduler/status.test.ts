import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return { ...actual, execFileSync: vi.fn() }
})

import { execFileSync } from 'child_process'
import { statusScheduler } from '../../src/scheduler/status.js'

const originalPlatform = process.platform

function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { configurable: true, value: p })
}

afterEach(() => {
  setPlatform(originalPlatform)
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('statusScheduler — Windows', () => {
  beforeEach(() => setPlatform('win32' as NodeJS.Platform))

  it('calls schtasks /query and writes the result to stdout', async () => {
    vi.mocked(execFileSync).mockReturnValue(Buffer.from('Status: Ready'))

    const out: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out.push(String(s)); return true })

    await statusScheduler()

    expect(execFileSync).toHaveBeenCalledWith(
      'schtasks', ['/query', '/tn', 'ots-mcp-check-pending', '/fo', 'LIST'],
    )
    expect(out.join('')).toContain('Status: Ready')
  })

  it('reports "task not found" to stdout when schtasks throws', async () => {
    vi.mocked(execFileSync).mockImplementationOnce(() => { throw new Error('no task') })

    const out: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out.push(String(s)); return true })

    await statusScheduler()

    expect(out.join('')).toContain('not found')
  })
})

describe('statusScheduler — Linux/macOS', () => {
  beforeEach(() => setPlatform('linux' as NodeJS.Platform))

  it('prints crontab check instructions and does not call schtasks', async () => {
    const out: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out.push(String(s)); return true })

    await statusScheduler()

    expect(out.join('')).toContain('crontab')
    expect(execFileSync).not.toHaveBeenCalled()
  })
})
