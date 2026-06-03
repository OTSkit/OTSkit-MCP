import { execFileSync } from 'child_process'
import { writeFileSync, renameSync } from 'fs'

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
