import { describe, it, expect, vi } from 'vitest'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { hashFileTool } from '../../src/tools/hash-file.js'

vi.mock('@otskit/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@otskit/client')>()
  return {
    ...actual,
    hashFile: vi.fn().mockImplementation(async (path: string) => {
      const { createHash } = await import('node:crypto')
      const { readFileSync } = await import('node:fs')
      return createHash('sha256').update(readFileSync(path)).digest()
    }),
  }
})

describe('hash_file tool', () => {
  it('returns 64-char hex SHA-256 of a file', async () => {
    const dir = join(tmpdir(), `ots-hash-test-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    const filePath = join(dir, 'test.txt')
    writeFileSync(filePath, 'hola mundo')

    const result = await hashFileTool({ path: filePath })

    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.hash).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it('returns file_not_found error for missing file', async () => {
    const result = await hashFileTool({ path: '/ruta/que/no/existe/fichero.txt' })
    expect(result).toMatchObject({ error: 'file_not_found' })
  })
})
