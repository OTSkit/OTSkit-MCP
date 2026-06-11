import { validateFilePath, hashFileStreaming } from '../utils.js'
import { createTimestamp } from './create-timestamp.js'
import type { DatabaseLike } from '../db/driver.js'
import type { Config } from '../types.js'

export async function stampFile(
  input: { path: string },
  db: DatabaseLike,
  config: Config
) {
  const v = validateFilePath(input.path, config.preserve_whitelist)
  if ('error' in v) return v
  let hash: string
  try {
    hash = await hashFileStreaming(v.path, config.preserve_max_bytes)
  } catch (e: any) {
    if (String(e?.message).startsWith('file_too_large')) return { error: 'file_too_large', details: e.message }
    /* c8 ignore next */ throw e
  }
  return createTimestamp({ hash }, db, config)
}
