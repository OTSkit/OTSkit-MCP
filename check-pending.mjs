import DB from 'better-sqlite3'
import os from 'os'

const db = new DB(os.homedir() + '/.ots-mcp/db.sqlite', { readonly: true })
const rows = db.prepare(`
  SELECT id, hash, status, created_at, attempt_count, last_attempt_at, last_error, next_retry_at
  FROM stamps WHERE status != 'confirmed'
  ORDER BY created_at ASC
`).all()

console.log(`Total no confirmados: ${rows.length}`)
for (const r of rows) {
  const age = Math.round((Date.now() - new Date(r.created_at).getTime()) / 3600000)
  console.log(`\n[${r.status}] ${r.id.slice(0,8)} — ${age}h antigüedad`)
  console.log(`  intentos: ${r.attempt_count} | último: ${r.last_attempt_at ?? 'nunca'}`)
  if (r.last_error) console.log(`  ERROR: ${r.last_error}`)
  console.log(`  próximo retry: ${r.next_retry_at ?? 'no programado'}`)
}
