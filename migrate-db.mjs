/**
 * Migración única: convierte la DB de WAL mode (better-sqlite3) a DELETE mode
 * compatible con node-sqlite3-wasm.
 *
 * Uso: node migrate-db.mjs
 *
 * Lo que hace:
 * 1. Usa Python para hacer checkpoint del WAL y exportar los datos
 * 2. Crea una nueva DB limpia con node-sqlite3-wasm
 * 3. Importa todos los datos
 * 4. Hace backup de la DB original y reemplaza con la nueva
 */
import { execSync } from 'child_process'
import { createRequire } from 'module'
import { existsSync, renameSync, rmSync } from 'fs'
import os from 'os'
import path from 'path'

const _require = createRequire(import.meta.url)
const { Database } = _require('node-sqlite3-wasm')

const dbPath = path.join(os.homedir(), '.ots-mcp', 'db.sqlite')
const backupPath = dbPath + '.bak-before-migration'
const tmpDump = path.join(os.tmpdir(), 'ots-mcp-dump.json')

if (!existsSync(dbPath)) {
  console.log('No hay base de datos en', dbPath, '— nada que migrar.')
  process.exit(0)
}

// ─── Paso 1: volcar datos con Python ─────────────────────────────────────────
console.log('Paso 1: exportando datos con Python...')

const pythonScript = `import sqlite3, json, sys
conn = sqlite3.connect(sys.argv[1])
conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
conn.row_factory = sqlite3.Row
stamps = [dict(r) for r in conn.execute("SELECT * FROM stamps")]
ops = [dict(r) for r in conn.execute("SELECT * FROM operations_log")]
with open(sys.argv[2], 'w') as f:
    json.dump({"stamps": stamps, "operations_log": ops}, f)
conn.close()
print(f"Exportados {len(stamps)} stamps, {len(ops)} operations_log")
`

const pyScriptPath = path.join(os.tmpdir(), 'ots-mcp-export.py')
;(await import('fs')).default.writeFileSync(pyScriptPath, pythonScript)

try {
  const py = process.platform === 'win32' ? 'py' : 'python3'
  execSync(`${py} "${pyScriptPath}" "${dbPath}" "${tmpDump}"`, { stdio: 'inherit' })
} catch (e) {
  console.error('Error en el export Python:', e.message)
  process.exit(1)
}

const { stamps, operations_log } = JSON.parse(
  (await import('fs')).default.readFileSync(tmpDump, 'utf8')
)
console.log(`  → ${stamps.length} stamps, ${operations_log.length} operaciones`)

// ─── Paso 2: crear nueva DB con node-sqlite3-wasm (fichero separado) ─────────
console.log('Paso 2: creando nueva DB con node-sqlite3-wasm...')
const newDbPath = dbPath.replace('.sqlite', '.sqlite-new')
if (existsSync(newDbPath)) rmSync(newDbPath, { force: true })
const db = new Database(newDbPath)

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE stamps (
    id              TEXT PRIMARY KEY,
    hash            TEXT NOT NULL,
    status          TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    confirmed_at    TEXT,
    bitcoin_block   INTEGER,
    bitcoin_time    TEXT,
    proof_path      TEXT,
    archive_path    TEXT,
    last_attempt_at TEXT,
    attempt_count   INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    next_retry_at   TEXT,
    metadata        TEXT
  );
  CREATE INDEX idx_stamps_hash   ON stamps(hash);
  CREATE INDEX idx_stamps_status ON stamps(status);

  CREATE TABLE operations_log (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    stamp_id         TEXT NOT NULL REFERENCES stamps(id),
    action           TEXT NOT NULL,
    result           TEXT NOT NULL,
    error_msg        TEXT,
    calendar_uri     TEXT,
    response_time_ms INTEGER,
    created_at       TEXT NOT NULL
  );
  CREATE INDEX idx_oplog_stamp_id ON operations_log(stamp_id);
  CREATE INDEX idx_oplog_created  ON operations_log(created_at);

  PRAGMA user_version = 1;
`)

// ─── Paso 4: importar datos ───────────────────────────────────────────────────
console.log('Paso 4: importando datos...')

db.exec('BEGIN')
for (const s of stamps) {
  db.run(
    `INSERT INTO stamps VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [s.id, s.hash, s.status, s.created_at, s.confirmed_at ?? null,
     s.bitcoin_block ?? null, s.bitcoin_time ?? null, s.proof_path ?? null,
     s.archive_path ?? null, s.last_attempt_at ?? null,
     s.attempt_count ?? 0, s.last_error ?? null,
     s.next_retry_at ?? null, s.metadata ?? null]
  )
}
for (const o of operations_log) {
  db.run(
    `INSERT INTO operations_log (id,stamp_id,action,result,error_msg,calendar_uri,response_time_ms,created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [o.id, o.stamp_id, o.action, o.result, o.error_msg ?? null,
     o.calendar_uri ?? null, o.response_time_ms ?? null, o.created_at]
  )
}
db.exec('COMMIT')

// ─── Verificación ─────────────────────────────────────────────────────────────
const total = db.get('SELECT COUNT(*) as n FROM stamps')
const byStatus = db.all('SELECT status, COUNT(*) as n FROM stamps GROUP BY status')
db.close()

console.log('\n=== Migración completada ===')
console.log('Stamps migrados:', total.n)
for (const row of byStatus) console.log(' ', row.status, '→', row.n)
console.log('\nNueva DB lista en:', newDbPath)
console.log('\nPASO FINAL (manual):')
console.log('  1. Para el servidor MCP (cierra Claude si lo tienes abierto)')
console.log('  2. Ejecuta:')
console.log(`     ren "${dbPath}" "${path.basename(backupPath)}"`)
console.log(`     ren "${newDbPath}" "${path.basename(dbPath)}"`)
console.log('  3. Reinicia el servidor')
rmSync(tmpDump, { force: true })
