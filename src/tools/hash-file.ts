import { validateFilePath, hashFileStreaming } from '../utils.js'
import type { Config } from '../types.js'

type HashFileSuccess = { hash: string }
type HashFileError = {
  error: 'invalid_path' | 'path_not_allowed' | 'not_a_regular_file' | 'file_too_large'
  details: string
}

export async function hashFileTool(
  input: { path: string },
  config: Config
): Promise<HashFileSuccess | HashFileError> {
  const v = validateFilePath(input.path, config.preserve_whitelist)
  if ('error' in v) return v
  try {
    const hash = await hashFileStreaming(v.path, config.preserve_max_bytes)
    return { hash }
  } catch (e: any) {
    if (String(e?.message).startsWith('file_too_large')) return { error: 'file_too_large', details: e.message }
    /* c8 ignore next */ throw e
  }
}
