import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { escapeXml, which, validateFilePath } from '../src/utils.js'

describe('escapeXml', () => {
  it('escapes the five XML metacharacters, ampersand first', () => {
    expect(escapeXml(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f')
  })
  it('escapes a malicious binary path', () => {
    expect(escapeXml('C:\\x\\<evil>.exe')).toBe('C:\\x\\&lt;evil&gt;.exe')
  })
  it('leaves a normal path untouched', () => {
    expect(escapeXml('C:\\Program Files\\ots\\ots-mcp.exe')).toBe('C:\\Program Files\\ots\\ots-mcp.exe')
  })
})

describe('which', () => {
  it('returns the path of a command that exists (node is always available)', () => {
    const result = which('node')
    expect(result).not.toBeNull()
    expect(typeof result).toBe('string')
  })

  it('returns null for a command that does not exist', () => {
    expect(which('__this_command_does_not_exist_ots__')).toBeNull()
  })
})

describe('validateFilePath', () => {
  it('returns invalid_path for a path that does not exist', () => {
    const result = validateFilePath('/nonexistent/path/file.txt', [])
    expect(result).toMatchObject({ error: 'invalid_path' })
  })

  it('returns not_a_regular_file for a directory', () => {
    const result = validateFilePath(tmpdir(), [])
    expect(result).toMatchObject({ error: 'not_a_regular_file' })
  })

  it('returns the canonical path for a valid regular file with empty whitelist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ots-utils-'))
    const file = join(dir, 'f.txt')
    try {
      writeFileSync(file, 'x')
      const result = validateFilePath(file, [])
      expect('path' in result).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns path_not_allowed when file is outside whitelist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ots-utils-'))
    const file = join(dir, 'f.txt')
    try {
      writeFileSync(file, 'x')
      const result = validateFilePath(file, ['/some/other/dir'])
      expect(result).toMatchObject({ error: 'path_not_allowed' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('accepts a file inside a whitelisted directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ots-utils-'))
    const file = join(dir, 'f.txt')
    try {
      writeFileSync(file, 'x')
      const result = validateFilePath(file, [dir])
      expect('path' in result).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
