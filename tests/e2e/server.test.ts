/**
 * E2E tests: arranca el servidor MCP real como subproceso y habla con él
 * por stdio usando el protocolo JSON-RPC de MCP.
 *
 * Cubre lo que Glama hace internamente: tools/list + tools/call reales
 * con SQLite inicializado desde node-sqlite3-wasm.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'
import { mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'

// ─── MCP stdio client ────────────────────────────────────────────────────────

class McpClient {
  private buf = ''
  private pending = new Map<number, (r: unknown) => void>()
  private nextId = 1

  constructor(private proc: ChildProcess) {
    proc.stdout!.on('data', (chunk: Buffer) => {
      this.buf += chunk.toString()
      const lines = this.buf.split('\n')
      this.buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line) as { id?: number; result?: unknown; error?: unknown }
          if (msg.id !== undefined && this.pending.has(msg.id)) {
            this.pending.get(msg.id)!(msg)
            this.pending.delete(msg.id)
          }
        } catch { /* ignore framing noise */ }
      }
    })
  }

  request(method: string, params?: unknown): Promise<{ result?: unknown; error?: unknown }> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 8000)
      this.pending.set(id, (msg) => { clearTimeout(timer); resolve(msg as any) })
      this.proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    })
  }

  notify(method: string, params?: unknown): void {
    this.proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
  }
}

// ─── Setup ───────────────────────────────────────────────────────────────────

const DATA_DIR = join(tmpdir(), `ots-e2e-${randomUUID()}`)
let proc: ChildProcess
let client: McpClient

beforeAll(async () => {
  mkdirSync(DATA_DIR, { recursive: true })

  proc = spawn('node', [join(process.cwd(), 'dist/index.js'), 'serve'], {
    env: { ...process.env, OTS_MCP_DATA_DIR: DATA_DIR },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  proc.stderr!.on('data', () => { /* silenciar stderr del servidor en tests */ })

  client = new McpClient(proc)

  // handshake MCP
  const init = await client.request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'e2e-test', version: '1.0' },
  })
  expect((init as any).result?.serverInfo?.name).toBe('ots-mcp')
  client.notify('notifications/initialized')
}, 15000)

afterAll(() => {
  proc?.stdin?.end()
  proc?.kill()
  try { rmSync(DATA_DIR, { recursive: true, force: true }) } catch { /* */ }
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MCP server — E2E', () => {

  it('tools/list devuelve las 8 herramientas esperadas', async () => {
    const res = await client.request('tools/list', {})
    const tools = ((res as any).result?.tools ?? []) as { name: string }[]
    const names = tools.map(t => t.name).sort()

    expect(names).toContain('create_timestamp')
    expect(names).toContain('upgrade_timestamp')
    expect(names).toContain('verify_timestamp')
    expect(names).toContain('inspect_timestamp')
    expect(names).toContain('list_pending')
    expect(names).toContain('stamp_file')
    expect(names).toContain('hash_file')
    expect(names).toContain('watch')
    expect(names).toHaveLength(8)
  }, 10000)

  it('list_pending sobre DB vacía devuelve items:[] total:0', async () => {
    const res = await client.request('tools/call', {
      name: 'list_pending',
      arguments: { limit: 10, offset: 0 },
    })
    const text = ((res as any).result?.content?.[0]?.text ?? '') as string
    const body = JSON.parse(text)
    expect(body.items).toHaveLength(0)
    expect(body.total).toBe(0)
  }, 10000)

  it('inspect_timestamp con id desconocido devuelve error not_found', async () => {
    const res = await client.request('tools/call', {
      name: 'inspect_timestamp',
      arguments: { id: 'no-existe-este-id' },
    })
    const text = ((res as any).result?.content?.[0]?.text ?? '') as string
    const body = JSON.parse(text)
    expect(body.error).toBe('not_found')
  }, 10000)

  it('create_timestamp rechaza hash inválido sin llamar a la red', async () => {
    const res = await client.request('tools/call', {
      name: 'create_timestamp',
      arguments: { hash: 'no-es-un-hash-valido' },
    })
    const text = ((res as any).result?.content?.[0]?.text ?? '') as string
    const body = JSON.parse(text)
    expect(body.error).toBe('invalid_hash')
  }, 10000)

  it('herramienta desconocida devuelve error unknown_tool', async () => {
    const res = await client.request('tools/call', {
      name: 'herramienta_que_no_existe',
      arguments: {},
    })
    const text = ((res as any).result?.content?.[0]?.text ?? '') as string
    const body = JSON.parse(text)
    expect(body.error).toBe('unknown_tool')
  }, 10000)

})
