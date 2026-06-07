import { describe, it, expect } from 'vitest'
import { escapeXml } from '../src/utils.js'

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
