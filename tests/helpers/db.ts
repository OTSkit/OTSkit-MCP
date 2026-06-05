import { createRequire } from 'module'
import type { DatabaseLike } from '../../src/db/driver.js'

const _require = createRequire(import.meta.url)
const { Database } = _require('node-sqlite3-wasm') as { Database: new (path: string) => DatabaseLike }

export function makeRawDb(): DatabaseLike {
  return new Database(':memory:')
}
