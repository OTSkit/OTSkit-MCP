import { describe, it, expect, vi, afterEach } from 'vitest'

const mockInstall = vi.fn().mockResolvedValue(undefined)
const mockRemove  = vi.fn().mockResolvedValue(undefined)
const mockStatus  = vi.fn().mockResolvedValue(undefined)

vi.mock('../../src/scheduler/install.js', () => ({ installScheduler: mockInstall }))
vi.mock('../../src/scheduler/remove.js',  () => ({ removeScheduler: mockRemove  }))
vi.mock('../../src/scheduler/status.js',  () => ({ statusScheduler: mockStatus  }))

import { runScheduler } from '../../src/scheduler/index.js'

afterEach(() => vi.clearAllMocks())

describe('runScheduler', () => {
  it('routes "install" to installScheduler with remaining args', async () => {
    await runScheduler(['install', '--interval', '60'])
    expect(mockInstall).toHaveBeenCalledWith(['--interval', '60'])
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('routes "remove" to removeScheduler', async () => {
    await runScheduler(['remove'])
    expect(mockRemove).toHaveBeenCalled()
  })

  it('routes "status" to statusScheduler', async () => {
    await runScheduler(['status'])
    expect(mockStatus).toHaveBeenCalled()
  })

  it('writes usage to stderr and exits with code 1 for unknown subcommands', async () => {
    const errs: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((s) => { errs.push(String(s)); return true })
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((_code) => { throw new Error('process.exit') })

    await expect(runScheduler(['unknown'])).rejects.toThrow('process.exit')

    expect(errs.join('')).toContain('Usage')
    expect(mockExit).toHaveBeenCalledWith(1)

    mockExit.mockRestore()
  })
})
