import { describe, it, expect } from 'vitest'
import { TOOL_DEFINITIONS } from '../src/tool-definitions.js'

const toolNames = ['create_timestamp', 'upgrade_timestamp', 'verify_timestamp', 'list_pending', 'preserve', 'inspect_timestamp']

describe('tool definitions', () => {
  it('exposes all expected tools', () => {
    const names = TOOL_DEFINITIONS.map(t => t.name)
    for (const name of toolNames) {
      expect(names).toContain(name)
    }
  })

  it('inspect_timestamp is read-only, idempotent, closed-world', () => {
    const t = TOOL_DEFINITIONS.find(t => t.name === 'inspect_timestamp')!
    expect(t.annotations?.readOnlyHint).toBe(true)
    expect(t.annotations?.idempotentHint).toBe(true)
    expect(t.annotations?.openWorldHint).toBe(false)
  })

  it('verify_timestamp is read-only, idempotent, open-world', () => {
    const t = TOOL_DEFINITIONS.find(t => t.name === 'verify_timestamp')!
    expect(t.annotations?.readOnlyHint).toBe(true)
    expect(t.annotations?.idempotentHint).toBe(true)
    expect(t.annotations?.openWorldHint).toBe(true)
  })

  it('upgrade_timestamp is not read-only, idempotent, open-world', () => {
    const t = TOOL_DEFINITIONS.find(t => t.name === 'upgrade_timestamp')!
    expect(t.annotations?.readOnlyHint).toBe(false)
    expect(t.annotations?.idempotentHint).toBe(true)
    expect(t.annotations?.openWorldHint).toBe(true)
  })

  it('create_timestamp is not read-only, not idempotent, open-world', () => {
    const t = TOOL_DEFINITIONS.find(t => t.name === 'create_timestamp')!
    expect(t.annotations?.readOnlyHint).toBe(false)
    expect(t.annotations?.idempotentHint).toBe(false)
    expect(t.annotations?.openWorldHint).toBe(true)
  })

  it('preserve is not read-only, not idempotent, open-world', () => {
    const t = TOOL_DEFINITIONS.find(t => t.name === 'preserve')!
    expect(t.annotations?.readOnlyHint).toBe(false)
    expect(t.annotations?.idempotentHint).toBe(false)
    expect(t.annotations?.openWorldHint).toBe(true)
  })

  it('list_pending is read-only, idempotent, closed-world', () => {
    const t = TOOL_DEFINITIONS.find(t => t.name === 'list_pending')!
    expect(t.annotations?.readOnlyHint).toBe(true)
    expect(t.annotations?.idempotentHint).toBe(true)
    expect(t.annotations?.openWorldHint).toBe(false)
  })
})
