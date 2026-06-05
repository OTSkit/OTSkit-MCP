import { readFileSync } from 'node:fs'
import { OpSHA256 } from '@otskit/core'
import { createTimestamp } from './create-timestamp.js'
import type { DatabaseLike } from '../db/driver.js'
import type { Config } from '../types.js'

export async function stampFile(
  input: { path: string },
  db: DatabaseLike,
  config: Config
) {
  const data = new Uint8Array(readFileSync(input.path))
  const hash = Buffer.from(new OpSHA256().hash(data)).toString('hex')
  return createTimestamp({ hash }, db, config)
}
