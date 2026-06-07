import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync, realpathSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { hashFileTool } from '../../src/tools/hash-file.js'
import type { Config } from '../../src/types.js'

const BASE_CONFIG: Config = {
  stamp_enabled: true, preserve_enabled: true, preserve_whitelist: [],
  preserve_max_bytes: 104_857_600, preserve_max_files: 10_000,
  scheduler_interval_minutes: 30, calendar_timeout_ms: 10_000,
  retry_max_attempts: 20,
  log_file: '/tmp/test.log', calendars: [],
}

function freshDir(tag: string): string {
  const dir = join(tmpdir(), `ots-hf-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return realpathSync(dir)
}

describe('hash_file tool', () => {
  it('hashes an allowed regular file', async () => {
    const dir = freshDir('ok')
    const f = join(dir, 'b.txt'); writeFileSync(f, 'hello')
    const result = await hashFileTool({ path: f }, { ...BASE_CONFIG, preserve_whitelist: [dir] })
    expect(result).toMatchObject({ hash: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824' })
  })

  it('hashes a file when whitelist is empty (no restriction)', async () => {
    const dir = freshDir('empty')
    const f = join(dir, 'c.txt'); writeFileSync(f, 'hello')
    const result = await hashFileTool({ path: f }, { ...BASE_CONFIG, preserve_whitelist: [] })
    expect('error' in result).toBe(false)
    if (!('error' in result)) expect(result.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rejects a path outside the whitelist', async () => {
    const dir = freshDir('out')
    const f = join(dir, 'a.txt'); writeFileSync(f, 'hi')
    const result = await hashFileTool({ path: f }, { ...BASE_CONFIG, preserve_whitelist: [join(tmpdir(), 'other-only')] })
    expect(result).toMatchObject({ error: 'path_not_allowed' })
  })

  it('rejects a directory (not a regular file)', async () => {
    const dir = freshDir('dir')
    const result = await hashFileTool({ path: dir }, { ...BASE_CONFIG, preserve_whitelist: [] })
    expect(result).toMatchObject({ error: 'not_a_regular_file' })
  })

  it('returns invalid_path for a missing file', async () => {
    const result = await hashFileTool({ path: '/ruta/que/no/existe/fichero.txt' }, { ...BASE_CONFIG, preserve_whitelist: [] })
    expect(result).toMatchObject({ error: 'invalid_path' })
  })

  it('rejects a file larger than preserve_max_bytes', async () => {
    const dir = freshDir('big')
    const f = join(dir, 'big.bin'); writeFileSync(f, Buffer.alloc(2048))
    const result = await hashFileTool({ path: f }, { ...BASE_CONFIG, preserve_whitelist: [dir], preserve_max_bytes: 1024 })
    expect(result).toMatchObject({ error: 'file_too_large' })
  })
})
