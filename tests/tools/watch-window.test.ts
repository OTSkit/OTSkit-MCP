import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Factory must not reference external const/let variables (vi.mock is hoisted).
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return { ...actual, exec: vi.fn() }
})

import { exec } from 'child_process'
import { openWatchWindow } from '../../src/tools/watch-window.js'

beforeEach(() => {
  vi.mocked(exec).mockImplementation((_cmd, _opts, cb) => { (cb as any)(null); return {} as any })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('openWatchWindow', () => {
  it('returns opened:true with default 30-minute interval', () => {
    const result = openWatchWindow()
    expect(result.opened).toBe(true)
    expect(result.interval_minutes).toBe(30)
  })

  it('normalizes an interval below the 15-minute minimum', () => {
    const result = openWatchWindow(5)
    expect(result.opened).toBe(true)
    expect(result.interval_minutes).toBe(15)
  })

  it('passes the resolved interval into the shell command', () => {
    openWatchWindow(60)
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('60'),
      expect.objectContaining({ shell: 'cmd' }),
      expect.any(Function),
    )
  })

  it('does not include an error field synchronously (exec callback is async)', () => {
    const result = openWatchWindow(30)
    expect(result).not.toHaveProperty('error')
  })
})
