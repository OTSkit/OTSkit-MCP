import { describe, it, expect } from 'vitest'
import { HashInput, IdInput, PathInput, ListInput, WatchInput, parse } from '../src/schemas.js'

describe('schemas (boundary validation)', () => {
  it('rejects a non-string hash (type confusion)', () => {
    expect(() => parse(HashInput, { hash: 123 })).toThrow(/invalid_params/)
  })
  it('accepts any string hash (format is checked by the handler)', () => {
    expect(parse(HashInput, { hash: 'not-hex-but-a-string' })).toEqual({ hash: 'not-hex-but-a-string' })
  })
  it('rejects a missing id', () => {
    expect(() => parse(IdInput, {})).toThrow(/invalid_params/)
  })
  it('accepts a non-uuid id string (not_found is the handler concern)', () => {
    expect(parse(IdInput, { id: 'no-existe' })).toEqual({ id: 'no-existe' })
  })
  it('rejects unknown keys (strict object)', () => {
    expect(() => parse(PathInput, { path: '/x', evil: 1 })).toThrow(/invalid_params/)
  })
  it('rejects an out-of-range list limit', () => {
    expect(() => parse(ListInput, { limit: 9999 })).toThrow(/invalid_params/)
  })
  it('rejects a negative offset', () => {
    expect(() => parse(ListInput, { offset: -1 })).toThrow(/invalid_params/)
  })
  it('rejects an invalid status enum', () => {
    expect(() => parse(ListInput, { status: 'bogus' })).toThrow(/invalid_params/)
  })
  it('rejects a watch interval below the minimum', () => {
    expect(() => parse(WatchInput, { interval_minutes: 5 })).toThrow(/invalid_params/)
  })
})
