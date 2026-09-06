import { describe, it, expect } from 'vitest'
import { featureDisabledError } from '../src/feature-gate.js'
import type { Config } from '../src/types.js'

const CFG = (over: Partial<Config>): Config => ({
  stamp_enabled: true, preserve_enabled: true, preserve_whitelist: [],
  preserve_max_bytes: 1, preserve_max_files: 1, scheduler_interval_minutes: 30,
  calendar_timeout_ms: 10_000, retry_max_attempts: 20, log_file: '/tmp/x', calendars: [],
  ...over,
})

describe('featureDisabledError', () => {
  it('blocks stamp tools when stamp_enabled is false', () => {
    expect(featureDisabledError('create_timestamp', CFG({ stamp_enabled: false })))
      .toEqual({ error: 'feature_disabled', feature: 'stamp' })
  })
  it('blocks external proof verification when stamp_enabled is false', () => {
    expect(featureDisabledError('verify_external_proof', CFG({ stamp_enabled: false })))
      .toEqual({ error: 'feature_disabled', feature: 'stamp' })
  })
  it('allows stamp tools when stamp_enabled is true', () => {
    expect(featureDisabledError('create_timestamp', CFG({}))).toBeNull()
  })
  it('blocks stamp_file when preserve_enabled is false', () => {
    expect(featureDisabledError('stamp_file', CFG({ preserve_enabled: false })))
      .toEqual({ error: 'feature_disabled', feature: 'preserve' })
  })
  it('returns null for an unknown tool name', () => {
    expect(featureDisabledError('whatever', CFG({}))).toBeNull()
  })
})
