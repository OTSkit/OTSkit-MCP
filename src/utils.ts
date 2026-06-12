import { execFileSync } from 'node:child_process'
import { writeFileSync, renameSync, realpathSync, statSync, createReadStream } from 'node:fs'
import { resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'

export function which(cmd: string): string | null {
  try {
    const out = execFileSync(
      process.platform === 'win32' ? 'where' : 'which', [cmd]
    ).toString().trim()
    return out.split('\n')[0] ?? null
  } catch {
    return null
  }
}

export function writeAtomic(dest: string, data: Uint8Array | Buffer): void {
  const tmp = dest + '.tmp'
  writeFileSync(tmp, data)
  renameSync(tmp, dest)
}

// Escapes the five XML metacharacters for safe interpolation into XML text or
// attribute values. The ampersand replacement must run first to avoid
// double-escaping the entities produced by the others.
export function escapeXml(raw: string): string {
  return raw
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export type PathError = 'invalid_path' | 'path_not_allowed' | 'not_a_regular_file'

// Canonicalizes a user-supplied path (resolving symlinks / `..`), enforces an
// optional directory whitelist, and rejects anything that is not a regular file.
export function validateFilePath(
  rawPath: string,
  whitelist: string[]
): { path: string } | { error: PathError; details: string } {
  let canonical: string
  try {
    canonical = realpathSync(rawPath)
  } catch (e: any) {
    return { error: 'invalid_path', details: String(e?.message ?? e) }
  }
  if (whitelist.length > 0) {
    const allowed = whitelist.some(dir => {
      const root = resolve(dir)
      return canonical === root || canonical.startsWith(root + sep)
    })
    if (!allowed) return { error: 'path_not_allowed', details: `${canonical} is outside allowed directories` }
  }
  let st
  try {
    st = statSync(canonical)
  /* c8 ignore next 2 — race condition: realpathSync succeeded but statSync failed immediately after */
  } catch (e: any) {
    return { error: 'invalid_path', details: String(e?.message ?? e) }
  }
  if (!st.isFile()) return { error: 'not_a_regular_file', details: `${canonical} is not a regular file` }
  return { path: canonical }
}

// Streams a SHA-256 digest without loading the whole file into memory, aborting
// if the file exceeds maxBytes. Rejects with an Error whose message starts with
// "file_too_large" when the cap is hit.
export async function hashFileStreaming(filePath: string, maxBytes: number): Promise<string> {
  const hash = createHash('sha256')
  let bytesRead = 0
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytesRead += chunk.length
      if (bytesRead > maxBytes) cb(new Error(`file_too_large: exceeds ${maxBytes} bytes`))
      else cb(null, chunk)
    },
  })
  await pipeline(createReadStream(filePath), limiter, hash)
  return hash.digest('hex')
}
