import { createReadStream, createWriteStream, realpathSync, statSync, mkdirSync } from 'fs'
import { join, resolve, sep } from 'path'
import { createHash, randomUUID } from 'crypto'
import archiver from 'archiver'
import type { Database } from 'better-sqlite3'
import type { Config } from '../types.js'
import { createTimestamp } from './create-timestamp.js'
import { getDataDir } from '../config.js'

type PreserveSuccess = {
  id: string; hash: string; archive_path: string; proof_path: string
  status: 'pending'; files_count: number; archive_size_bytes: number; warnings: string[]
}
type PreserveError = {
  error: 'whitelist_not_configured' | 'path_not_in_whitelist' | 'resource_limit_exceeded' | 'stamp_error' | 'storage_error'
  details: string
}

function isPathInWhitelist(resolvedPath: string, whitelist: string[]): boolean {
  const parts = resolvedPath.split(sep)
  return whitelist.some(entry => {
    const entryParts = resolve(entry).split(sep)
    return entryParts.length <= parts.length &&
      entryParts.every((part, i) => parts[i] === part)
  })
}

export async function preserve(
  input: { dir_path: string; label?: string },
  db: Database,
  config: Config
): Promise<PreserveSuccess | PreserveError> {
  if (!config.preserve_enabled || config.preserve_whitelist.length === 0) {
    return { error: 'whitelist_not_configured', details: 'Set preserve_whitelist in ~/.ots-mcp/config.json' }
  }

  let resolvedInput: string
  try {
    resolvedInput = realpathSync(resolve(input.dir_path))
  } catch (e) {
    return { error: 'path_not_in_whitelist', details: `Cannot resolve path: ${e}` }
  }

  const resolvedWhitelist = config.preserve_whitelist.map(p => {
    try { return realpathSync(resolve(p)) } catch { return resolve(p) }
  })

  if (!isPathInWhitelist(resolvedInput, resolvedWhitelist)) {
    return { error: 'path_not_in_whitelist', details: `${resolvedInput} is not in the configured whitelist` }
  }

  let st: ReturnType<typeof statSync>
  try { st = statSync(resolvedInput) } catch (e) {
    return { error: 'path_not_in_whitelist', details: String(e) }
  }
  if (!st.isDirectory()) {
    return { error: 'path_not_in_whitelist', details: 'Path must be a directory' }
  }

  const archiveDir = join(getDataDir(), 'archives')
  mkdirSync(archiveDir, { recursive: true })
  const label = input.label ? `-${input.label.replace(/[^a-z0-9-]/gi, '_')}` : ''
  const archivePath = join(archiveDir, `${randomUUID()}${label}.zip`)
  const warnings: string[] = []
  let filesCount = 0

  await new Promise<void>((res, rej) => {
    const output = createWriteStream(archivePath)
    const arc = archiver('zip', { zlib: { level: 6 } })
    arc.on('warning', e => { if (e.code === 'ENOENT') warnings.push(e.message); else rej(e) })
    arc.on('error', rej)
    arc.on('entry', () => { filesCount++ })
    output.on('close', res)
    arc.pipe(output)
    arc.directory(resolvedInput, false)
    arc.finalize()
  })

  const archiveSize = statSync(archivePath).size
  if (archiveSize > config.preserve_max_bytes) {
    return { error: 'resource_limit_exceeded', details: `Archive ${archiveSize} bytes exceeds limit ${config.preserve_max_bytes}` }
  }

  const hash = await new Promise<string>((res, rej) => {
    const h = createHash('sha256')
    createReadStream(archivePath)
      .on('data', d => h.update(d))
      .on('end', () => res(h.digest('hex')))
      .on('error', rej)
  })

  const stampResult = await createTimestamp({ hash }, db, config)
  if ('error' in stampResult) return { error: 'stamp_error', details: stampResult.details }

  db.prepare('UPDATE stamps SET archive_path = ?, metadata = ? WHERE id = ?').run(
    archivePath,
    JSON.stringify({ source_path: resolvedInput, files_count: filesCount, total_bytes: archiveSize }),
    stampResult.id
  )

  return {
    id: stampResult.id, hash, archive_path: archivePath, proof_path: stampResult.proof_path,
    status: 'pending', files_count: filesCount, archive_size_bytes: archiveSize, warnings,
  }
}
