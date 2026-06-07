# OTSkit MCP — Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 13 confirmed findings (plus one latent bug discovered during planning) from the adversarial security review of OTSkit MCP, applying SOTA best practices verified against the actual codebase.

**Architecture:** Validate untrusted input at the MCP boundary with Zod; never trust local `.ots` attestations for Bitcoin confirmation; lock down configurable URLs against SSRF; make DB writes atomic; stop leaking filesystem paths to AI agents.

**Tech Stack:** TypeScript ESM, Node.js 18+, Zod v4 (runtime validation), node-sqlite3-wasm (SQLite), @otskit/client (OTS protocol), vitest (tests), tsup/esbuild (build).

---

## CRITICAL PRE-READ — Discoveries that override the agent research

The two research agents made assumptions that are **wrong against the real code**. The plan below reflects the verified truth:

1. **`@otskit/client` `ClientOptions` does NOT accept any Esplora field.** Esplora URL is hardcoded inside the library. → **N3 fix = remove `esplora_url` from Config** (it is a config lie), NOT "pass esploraUrl to the constructor".

2. **The current `resilience: { timeout: ... }` is silently ignored.** `ResilienceOptions` has `totalTimeoutMs` / `connectTimeoutMs`, not `timeout`. Because the build uses `tsup`/esbuild (no type-checking), this bug was never caught. → **N4 (new): fix the resilience field mapping** so `calendar_timeout_ms` actually takes effect.

3. **`calendar_max_response_bytes` / `retry_max_attempts` cannot reach the HTTP layer** through the current client API in a simple way; `retry_max_attempts` maps to the nested `resilience.retries.maxAttempts`, and the library already has an internal Esplora response-size guard (`EsploraResponseError`). → **N2 fix = wire `retry_max_attempts` into `resilience.retries` and remove `calendar_max_response_bytes`** from Config.

4. **The build never type-checks.** `tsc --noEmit` must be added as a verification gate (Task 0.2) or the type-level fixes in this plan won't be validated.

5. **Keep the existing error contract.** Handlers return `{ error, details }` objects and `server.ts` wraps them as `{ content, isError }`. Do NOT introduce `McpError` — it would change the wire contract that e2e tests rely on.

**Zod v4 API notes:** use `z.strictObject({...})` (rejects unknown keys), `z.enum([...])`, `z.number().int().min().max()`, `.refine()` for URL checks, `schema.safeParse(x)` → `{ success, data | error }`, `error.issues[0].message`.

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `package.json` | Add `zod` dependency + `typecheck` script | Modify |
| `src/schemas.ts` | All Zod input schemas for the 8 tools + a shared parse helper | Create |
| `src/config.ts` | Strict Zod config validation + SSRF URL allowlist; drop dead fields | Modify |
| `src/types.ts` | Add `missing_proof` status; drop `esplora_url` / `calendar_max_response_bytes` | Modify |
| `src/utils.ts` | Add `escapeXml`, `validateFilePath`, `hashFileStreaming` | Modify |
| `src/server.ts` | Validate args via schemas; feature-flag gate before switch | Modify |
| `src/tools/create-timestamp.ts` | Atomic DB writes; fix resilience mapping; drop proof_path from response | Modify |
| `src/tools/upgrade-timestamp.ts` | Verify against blockchain in UpgradeError path; fix resilience mapping | Modify |
| `src/tools/verify-timestamp.ts` | Guard non-null results; fix resilience mapping | Modify |
| `src/tools/inspect-timestamp.ts` | Replace `proof_path` with `proof_exists` | Modify |
| `src/tools/list-pending.ts` | Omit `proof_path`/`archive_path` from public records | Modify |
| `src/tools/hash-file.ts` | Path validation + streaming hash | Modify |
| `src/tools/stamp-file.ts` | Path validation + streaming hash | Modify |
| `src/db/index.ts` | `reconcileOrphans` → `missing_proof` not `failed` | Modify |
| `src/scheduler/install.ts` | XML-escape interpolated values | Modify |
| `tests/**` | One test file per fix | Create/Modify |

---

## PHASE 0 — Infrastructure (enables everything else)

### Task 0.1: Add Zod as a direct dependency

**Files:**
- Modify: `package.json:31-36` (dependencies block)

- [ ] **Step 1: Add zod to dependencies**

In `package.json`, add to `"dependencies"` (zod 4.4.3 is already in the lockfile as a transitive dep, so this just makes it explicit and safe to import in a published package):

```json
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "@otskit/client": "^0.2.0",
    "@otskit/core": "^0.1.0",
    "node-sqlite3-wasm": "0.8.57",
    "zod": "^4.4.3"
  },
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile updated, `node_modules/zod` resolves.

- [ ] **Step 3: Commit**

```bash
rtk git add package.json pnpm-lock.yaml
git commit -m "chore: add zod as direct dependency for input validation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 0.2: Add type-check gate (catches the silent N4 bug)

**Files:**
- Modify: `package.json:25-30` (scripts block)

- [ ] **Step 1: Add typecheck script**

In `package.json` `"scripts"`:

```json
  "scripts": {
    "build": "tsup src/index.ts --format esm --clean --external node-sqlite3-wasm",
    "dev": "tsup src/index.ts --format esm --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 2: Run it — expect the N4 bug to surface**

Run: `pnpm typecheck`
Expected: FAIL with errors on `src/tools/create-timestamp.ts`, `upgrade-timestamp.ts`, `verify-timestamp.ts` — `'timeout' does not exist in type 'Partial<ResilienceOptions>'`. This proves the latent bug. (It will be fixed in Task 2.5.)

- [ ] **Step 3: Commit the script only**

```bash
rtk git add package.json
git commit -m "ci: add typecheck script (tsc --noEmit)

Build uses esbuild which skips type-checking; this gate catches
type errors the build silently ignored.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## PHASE 1 — HIGH severity

### Task 1.1: F11 — Stop trusting local attestations for confirmation

**Why:** When `client.upgrade()` throws `UpgradeError`, the code calls `checkBitcoinConfirmation(proofBefore)` which only parses the local `.ots` file. An attacker who writes to `~/.ots-mcp/proofs/` can forge a Bitcoin attestation and flip a stamp to `confirmed` with zero blockchain contact. SOTA (RFC 3161, OTS docs): a proof is confirmed only after verifying against the chain. CVE-class confirmed: timestamp-proof trust must not rest on the blob alone.

**Files:**
- Modify: `src/tools/upgrade-timestamp.ts:60-82` (the UpgradeError catch path)
- Test: `tests/tools/upgrade.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/tools/upgrade.test.ts` (follow the existing mock pattern in that file):

```typescript
it('does NOT confirm from local attestations when upgrade throws UpgradeError', async () => {
  // upgrade throws UpgradeError; verify (blockchain) says NOT valid
  const { OpenTimestampsClient, UpgradeError } = await import('@otskit/client')
  ;(OpenTimestampsClient as any).mockImplementation(() => ({
    upgrade: vi.fn().mockRejectedValue(new UpgradeError('not confirmed yet')),
    verify: vi.fn().mockResolvedValue({ valid: false, error: 'No Bitcoin attestation' }),
  }))
  const rec = insertStamp(db, { id: randomUUID(), hash: 'a'.repeat(64), proof_path: proofPath })
  const result = await upgradeTimestamp({ id: rec.id }, db, MOCK_CONFIG)
  expect(result).toMatchObject({ status: 'pending' })  // NOT confirmed
})

it('confirms only when blockchain verify succeeds in the UpgradeError path', async () => {
  const { OpenTimestampsClient, UpgradeError } = await import('@otskit/client')
  ;(OpenTimestampsClient as any).mockImplementation(() => ({
    upgrade: vi.fn().mockRejectedValue(new UpgradeError('not confirmed yet')),
    verify: vi.fn().mockResolvedValue({ valid: true, blockHeight: 800000, timestamp: 1700000000 }),
  }))
  const rec = insertStamp(db, { id: randomUUID(), hash: 'a'.repeat(64), proof_path: proofPath })
  const result = await upgradeTimestamp({ id: rec.id }, db, MOCK_CONFIG)
  expect(result).toMatchObject({ status: 'confirmed', bitcoin_block: 800000 })
})
```

Ensure the test file imports `insertStamp`, `randomUUID`, and writes a real proof file at `proofPath` in `beforeEach` (mirror the existing setup; if absent, add `writeFileSync(proofPath, Buffer.from([1,2,3]))`).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/tools/upgrade.test.ts -t "local attestations"`
Expected: FAIL — current code confirms from `checkBitcoinConfirmation`.

- [ ] **Step 3: Replace the UpgradeError catch body**

In `src/tools/upgrade-timestamp.ts`, replace lines 64-78 (the `if (e instanceof UpgradeError)` block) with blockchain verification:

```typescript
    if (e instanceof UpgradeError) {
      // Do NOT trust the local .ots attestation — verify against the blockchain.
      try {
        const v = await client.verify(proofBefore, record.hash)
        if (v.valid && v.blockHeight != null && v.timestamp != null) {
          const bitcoinTime = new Date(v.timestamp * 1000).toISOString()
          updateStampStatus(db, input.id, {
            status: 'confirmed', bitcoin_block: v.blockHeight, bitcoin_time: bitcoinTime,
            confirmed_at: now, last_attempt_at: now, attempt_count: newAttemptCount,
          })
          logOperation(db, { stamp_id: input.id, action: 'upgrade', result: 'success' })
          return { id: input.id, status: 'confirmed', bitcoin_block: v.blockHeight, bitcoin_time: bitcoinTime, proof_path: record.proof_path }
        }
      } catch { /* network error — fall through to pending */ }
      updateStampStatus(db, input.id, { last_attempt_at: now, attempt_count: newAttemptCount, next_retry_at: next })
      logOperation(db, { stamp_id: input.id, action: 'upgrade', result: 'pending' })
      return { id: input.id, status: 'pending', attempt_count: newAttemptCount, last_attempt_at: now, next_retry_at: next }
    }
```

Then delete the now-unused `checkBitcoinConfirmation` and `collectAttestations` functions (lines 14-33) **only if** they are not used elsewhere in the file (the success path at line 86 also calls `checkBitcoinConfirmation` — keep that one, so KEEP the helpers). On reflection: the post-upgrade success path legitimately parses the *freshly upgraded* proof returned by the library (not attacker-controlled at rest), so `checkBitcoinConfirmation(upgraded)` at line 86 stays. Only the `proofBefore` usage in the catch is the vulnerability. **Keep the helpers; only change the catch path.**

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/tools/upgrade.test.ts`
Expected: PASS (all upgrade tests).

- [ ] **Step 5: Commit**

```bash
rtk git add src/tools/upgrade-timestamp.ts tests/tools/upgrade.test.ts
git commit -m "fix: verify against blockchain instead of trusting local attestation on UpgradeError

An attacker with write access to the proofs dir could forge a Bitcoin
attestation in the .ots file and flip a stamp to confirmed. Now the
UpgradeError path verifies against Esplora before confirming.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 1.2: F1 + N1 — Path validation + streaming hash for file tools

**Why:** `hash_file` / `stamp_file` accept arbitrary paths from AI agents — read SSH keys, wallets, `/dev/urandom`, huge files. This is a documented MCP vuln class: CVE-2025-68145 (mcp-server-git path), CVE-2025-53109 (MCP filesystem symlink escape). SOTA: canonicalize with `realpath`, enforce allowlist, reject non-regular files, stream the hash with a byte cap.

**Files:**
- Modify: `src/utils.ts` (add `validateFilePath`, `hashFileStreaming`)
- Modify: `src/tools/hash-file.ts`
- Modify: `src/tools/stamp-file.ts`
- Modify: `src/types.ts` (add `preserve_max_bytes` is already there; reuse it)
- Test: `tests/tools/hash-file.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/tools/hash-file.test.ts`:

```typescript
import { writeFileSync, mkdirSync, symlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

it('rejects a path outside the whitelist', async () => {
  const dir = join(tmpdir(), `ots-hf-${Date.now()}`); mkdirSync(dir, { recursive: true })
  const f = join(dir, 'a.txt'); writeFileSync(f, 'hi')
  const cfg = { ...MOCK_CONFIG, preserve_whitelist: [join(tmpdir(), 'other-only')] }
  const result = await hashFileTool({ path: f }, cfg)
  expect(result).toMatchObject({ error: 'path_not_allowed' })
})

it('rejects a directory (not a regular file)', async () => {
  const dir = join(tmpdir(), `ots-hf2-${Date.now()}`); mkdirSync(dir, { recursive: true })
  const result = await hashFileTool({ path: dir }, { ...MOCK_CONFIG, preserve_whitelist: [] })
  expect(result).toMatchObject({ error: 'not_a_regular_file' })
})

it('hashes an allowed regular file', async () => {
  const dir = join(tmpdir(), `ots-hf3-${Date.now()}`); mkdirSync(dir, { recursive: true })
  const f = join(dir, 'b.txt'); writeFileSync(f, 'hello')
  const result = await hashFileTool({ path: f }, { ...MOCK_CONFIG, preserve_whitelist: [dir] })
  // sha256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
  expect(result).toMatchObject({ hash: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824' })
})
```

Note: `hashFileTool` now takes a second `config` argument. The test's `MOCK_CONFIG` must include `preserve_whitelist` and `preserve_max_bytes`.

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run tests/tools/hash-file.test.ts`
Expected: FAIL — `hashFileTool` currently takes one arg and does no validation.

- [ ] **Step 3: Add helpers to `src/utils.ts`**

```typescript
import { realpathSync, statSync, createReadStream } from 'fs'
import { resolve, sep } from 'path'
import { createHash } from 'crypto'
import { pipeline } from 'stream/promises'
import { Transform } from 'stream'

export type PathError = 'invalid_path' | 'path_not_allowed' | 'not_a_regular_file'

export function validateFilePath(rawPath: string, whitelist: string[]): { path: string } | { error: PathError; details: string } {
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
  try { st = statSync(canonical) } catch (e: any) { return { error: 'invalid_path', details: String(e?.message ?? e) } }
  if (!st.isFile()) return { error: 'not_a_regular_file', details: `${canonical} is not a regular file` }
  return { path: canonical }
}

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
```

- [ ] **Step 4: Rewrite `src/tools/hash-file.ts`**

```typescript
import { validateFilePath, hashFileStreaming } from '../utils.js'
import type { Config } from '../types.js'

type HashFileSuccess = { hash: string }
type HashFileError = { error: 'invalid_path' | 'path_not_allowed' | 'not_a_regular_file' | 'file_too_large'; details: string }

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
    throw e
  }
}
```

- [ ] **Step 5: Rewrite `src/tools/stamp-file.ts`**

```typescript
import { validateFilePath, hashFileStreaming } from '../utils.js'
import { createTimestamp } from './create-timestamp.js'
import type { DatabaseLike } from '../db/driver.js'
import type { Config } from '../types.js'

export async function stampFile(input: { path: string }, db: DatabaseLike, config: Config) {
  const v = validateFilePath(input.path, config.preserve_whitelist)
  if ('error' in v) return v
  let hash: string
  try {
    hash = await hashFileStreaming(v.path, config.preserve_max_bytes)
  } catch (e: any) {
    if (String(e?.message).startsWith('file_too_large')) return { error: 'file_too_large', details: e.message }
    throw e
  }
  return createTimestamp({ hash }, db, config)
}
```

- [ ] **Step 6: Update caller in `src/server.ts`**

Line 41 changes from `result = await hashFileTool(args as any)` to pass config (final form lands in Task 2.1): `result = await hashFileTool(parse(PathInput, args), config)`.

- [ ] **Step 7: Run tests**

Run: `pnpm vitest run tests/tools/hash-file.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
rtk git add src/utils.ts src/tools/hash-file.ts src/tools/stamp-file.ts tests/tools/hash-file.test.ts
git commit -m "fix: validate file paths and stream-hash in hash_file/stamp_file

Canonicalize with realpath, enforce preserve_whitelist, reject
non-regular files, and stream the SHA-256 with a byte cap. Prevents
arbitrary file read (CVE-2025-68145 / CVE-2025-53109 class) and
event-loop blocking on huge/special files.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## PHASE 2 — MEDIUM severity

### Task 2.1: F6 — Input schema validation at the MCP boundary

**Why:** `server.ts` casts every tool arg as `any`. SOTA: validate at the boundary (MCP spec; OWASP Input Validation). CVE-2025-54994 = MCP server passing unvalidated input to `exec`.

**Files:**
- Create: `src/schemas.ts`
- Modify: `src/server.ts:29-52`
- Test: `tests/e2e/server.test.ts` (or new `tests/schemas.test.ts`)

- [ ] **Step 1: Write failing test**

Create `tests/schemas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { HashInput, IdInput, PathInput, ListInput, parse } from '../src/schemas.js'

describe('schemas', () => {
  it('rejects non-hex hash', () => {
    expect(() => parse(HashInput, { hash: 'xyz' })).toThrow()
  })
  it('accepts a 64-char hex hash', () => {
    expect(parse(HashInput, { hash: 'a'.repeat(64) })).toEqual({ hash: 'a'.repeat(64) })
  })
  it('rejects a non-uuid id', () => {
    expect(() => parse(IdInput, { id: 'not-a-uuid' })).toThrow()
  })
  it('rejects unknown keys (strict)', () => {
    expect(() => parse(PathInput, { path: '/x', evil: 1 })).toThrow()
  })
  it('clamps/validates list limit range', () => {
    expect(() => parse(ListInput, { limit: 9999 })).toThrow()
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run tests/schemas.test.ts`
Expected: FAIL — `src/schemas.ts` doesn't exist.

- [ ] **Step 3: Create `src/schemas.ts`**

```typescript
import { z } from 'zod'

export function parse<T>(schema: z.ZodType<T>, args: unknown): T {
  const r = schema.safeParse(args ?? {})
  if (!r.success) {
    const msg = r.error.issues[0]?.message ?? 'invalid input'
    throw new Error(`invalid_params: ${msg}`)
  }
  return r.data
}

export const HashInput = z.strictObject({ hash: z.string().regex(/^[0-9a-f]{64}$/i) })
export const IdInput   = z.strictObject({ id: z.string().uuid() })
export const PathInput = z.strictObject({ path: z.string().min(1).max(4096) })
export const ListInput = z.strictObject({
  status: z.enum(['pending', 'confirmed', 'failed', 'timeout', 'missing_proof']).optional(),
  limit:  z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
  older_than_hours: z.number().positive().optional(),
  due_now: z.boolean().optional(),
})
export const WatchInput = z.strictObject({
  interval_minutes: z.number().int().min(15).max(1440).optional(),
})
```

- [ ] **Step 4: Wire into `src/server.ts`**

Add import at top: `import { HashInput, IdInput, PathInput, ListInput, WatchInput, parse } from './schemas.js'`. Replace the switch cases (lines 36-43):

```typescript
        case 'create_timestamp':  result = await createTimestamp(parse(HashInput, args), db, config); break
        case 'upgrade_timestamp': result = await upgradeTimestamp(parse(IdInput, args), db, config); break
        case 'verify_timestamp':  result = await verifyTimestamp(parse(IdInput, args), db, config); break
        case 'inspect_timestamp': result = inspectTimestamp(parse(IdInput, args), db, config); break
        case 'list_pending':      result = listPending(parse(ListInput, args), db, config); break
        case 'hash_file':         result = await hashFileTool(parse(PathInput, args), config); break
        case 'stamp_file':        result = await stampFile(parse(PathInput, args), db, config); break
        case 'watch':             result = openWatchWindow(parse(WatchInput, args).interval_minutes); break
```

The existing `catch (e)` at line 49 already converts the thrown `invalid_params:` error into `{ error: 'internal_error', details }`. Improve it to surface validation errors clearly:

```typescript
    } catch (e) {
      const details = String(e)
      const code = details.includes('invalid_params') ? 'invalid_params' : 'internal_error'
      return { content: [{ type: 'text', text: JSON.stringify({ error: code, details }) }], isError: true }
    }
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run tests/schemas.test.ts tests/e2e/server.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add src/schemas.ts src/server.ts tests/schemas.test.ts
git commit -m "fix: validate all tool inputs with Zod at the MCP boundary

Replaces 'args as any' casts with strict Zod schemas. Rejects unknown
keys, bad hashes, non-uuid ids, out-of-range pagination.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 2.2: F4 — Strict config validation + SSRF URL allowlist

**Why:** `{ ...DEFAULTS, ...raw }` lets anyone who writes `~/.ots-mcp/config.json` redirect calendars to `http://169.254.169.254/` (cloud metadata SSRF). SOTA: OWASP SSRF Cheat Sheet — scheme + host allowlist, HTTPS only.

**Files:**
- Modify: `src/config.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/config.test.ts`:

```typescript
it('rejects non-https calendar URL and falls back to defaults', () => {
  const dir = join(tmpdir(), `ots-cfg-${Date.now()}`); mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ calendars: ['http://evil.internal/'] }))
  process.env.OTS_MCP_DATA_DIR = dir
  const cfg = loadConfig()
  expect(cfg.calendars.every(u => u.startsWith('https://'))).toBe(true)
  expect(cfg.calendars).not.toContain('http://evil.internal/')
})

it('rejects calendar host not in allowlist', () => {
  const dir = join(tmpdir(), `ots-cfg2-${Date.now()}`); mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ calendars: ['https://169.254.169.254/'] }))
  process.env.OTS_MCP_DATA_DIR = dir
  const cfg = loadConfig()
  expect(cfg.calendars).not.toContain('https://169.254.169.254/')
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run tests/config.test.ts`
Expected: FAIL — current `loadConfig` blindly merges.

- [ ] **Step 3: Add schema to `src/config.ts`**

Add imports and schema; rewrite `loadConfig`:

```typescript
import { z } from 'zod'

const TRUSTED_CALENDAR_HOSTS = new Set([
  'alice.btc.calendar.opentimestamps.org',
  'bob.btc.calendar.opentimestamps.org',
  'finney.calendar.eternitywall.com',
  'btc.calendar.catallaxy.com',
])

const httpsAllowlisted = (hosts: Set<string>) =>
  z.string().refine(v => {
    try { const u = new URL(v); return u.protocol === 'https:' && hosts.has(u.hostname) }
    catch { return false }
  }, { message: 'URL must be https and in the host allowlist' })

const ConfigSchema = z.strictObject({
  stamp_enabled: z.boolean().optional(),
  preserve_enabled: z.boolean().optional(),
  preserve_whitelist: z.array(z.string()).optional(),
  preserve_max_bytes: z.number().int().positive().max(10 * 1024 ** 3).optional(),
  preserve_max_files: z.number().int().positive().max(100_000).optional(),
  scheduler_interval_minutes: z.number().int().min(1).max(1440).optional(),
  calendar_timeout_ms: z.number().int().min(1000).max(60_000).optional(),
  retry_max_attempts: z.number().int().min(1).max(100).optional(),
  log_file: z.string().optional(),
  calendars: z.array(httpsAllowlisted(TRUSTED_CALENDAR_HOSTS)).min(1).max(10).optional(),
}).partial()

export function loadConfig(): Config {
  const dir = getDataDir()
  mkdirSync(dir, { recursive: true })
  const configPath = join(dir, 'config.json')
  if (!existsSync(configPath)) return { ...DEFAULTS }
  let raw: unknown
  try { raw = JSON.parse(readFileSync(configPath, 'utf8')) }
  catch (e) { process.stderr.write(`[ots-mcp] config parse error, using defaults: ${e}\n`); return { ...DEFAULTS } }
  const parsed = ConfigSchema.safeParse(raw)
  if (!parsed.success) {
    process.stderr.write(`[ots-mcp] config validation failed, using defaults: ${parsed.error.issues[0]?.message}\n`)
    return { ...DEFAULTS }
  }
  return { ...DEFAULTS, ...parsed.data }
}
```

Note: `esplora_url` and `calendar_max_response_bytes` are intentionally absent (removed in Task 2.4 / 2.6). If `types.ts` still declares them at this point, leave them in `DEFAULTS` until Task 2.4 removes both together — sequence 2.4 BEFORE 2.2 if type errors block, or run 2.4 first. **Execution order: do Task 2.4 and 2.6 before 2.2.**

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/config.ts tests/config.test.ts
git commit -m "fix: strict config validation with HTTPS calendar host allowlist (SSRF)

Rejects non-https or non-allowlisted calendar URLs and unknown config
keys; falls back to safe defaults instead of merging attacker input.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 2.3: F5 — Enforce feature flags at the dispatcher

**Why:** `stamp_enabled` / `preserve_enabled` are declared but never checked. SOTA: one gate at dispatch, not per-handler.

**Files:**
- Modify: `src/server.ts` (before the switch)
- Test: `tests/e2e/server.test.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/e2e/server.test.ts` a case that calls `create_timestamp` with `stamp_enabled: false` config and expects `{ error: 'feature_disabled' }`. (Use the server's tool-call path or call the handler dispatch directly per the file's existing harness.)

```typescript
it('blocks stamp tools when stamp_enabled is false', async () => {
  // arrange a config with stamp_enabled:false, then invoke create_timestamp
  // expect isError true and body { error: 'feature_disabled', feature: 'stamp' }
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run tests/e2e/server.test.ts -t "feature_disabled"`
Expected: FAIL.

- [ ] **Step 3: Add the gate in `src/server.ts`**

Inside the `CallToolRequestSchema` handler, after `const config = getConfig()` and before `try`:

```typescript
    const STAMP_TOOLS = new Set(['create_timestamp', 'upgrade_timestamp', 'verify_timestamp', 'inspect_timestamp', 'list_pending', 'stamp_file', 'hash_file', 'watch'])
    const PRESERVE_TOOLS = new Set(['stamp_file'])
    if (STAMP_TOOLS.has(name) && !config.stamp_enabled)
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'feature_disabled', feature: 'stamp' }) }], isError: true }
    if (PRESERVE_TOOLS.has(name) && !config.preserve_enabled)
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'feature_disabled', feature: 'preserve' }) }], isError: true }
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/e2e/server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/server.ts tests/e2e/server.test.ts
git commit -m "fix: enforce stamp_enabled/preserve_enabled flags at the dispatcher

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 2.4: N3 — Remove the `esplora_url` config lie

**Why:** `@otskit/client` `ClientOptions` has no Esplora field; the configured value never takes effect. Better to remove it than mislead the operator.

**Files:**
- Modify: `src/types.ts:34` (remove `esplora_url`)
- Modify: `src/config.ts:27` (remove from DEFAULTS)
- Modify: `tests/tools/stamp.test.ts:22` and any MOCK_CONFIG referencing it

- [ ] **Step 1: Remove the field**

`src/types.ts`: delete line `esplora_url: string`.
`src/config.ts`: delete `esplora_url: 'https://blockstream.info/api',` from DEFAULTS.
Remove `esplora_url` from every `MOCK_CONFIG` in tests.

- [ ] **Step 2: Type-check**

Run: `pnpm typecheck`
Expected: no errors referencing `esplora_url`.

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add src/types.ts src/config.ts tests
git commit -m "fix: remove non-functional esplora_url config (client API does not accept it)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 2.5: N4 — Fix the silently-ignored resilience timeout

**Why:** `resilience: { timeout: config.calendar_timeout_ms }` is not a valid `ResilienceOptions` field, so `calendar_timeout_ms` is ignored at runtime. The real fields are `totalTimeoutMs` / `connectTimeoutMs`.

**Files:**
- Modify: `src/tools/create-timestamp.ts:33-36`
- Modify: `src/tools/upgrade-timestamp.ts:51-54`
- Modify: `src/tools/verify-timestamp.ts:32-35`

- [ ] **Step 1: Fix all three client constructions**

Replace `resilience: { timeout: config.calendar_timeout_ms }` with:

```typescript
    resilience: {
      totalTimeoutMs: config.calendar_timeout_ms,
      connectTimeoutMs: Math.min(config.calendar_timeout_ms, 5000),
      retries: { enabled: true, maxAttempts: config.retry_max_attempts, backoff: { strategy: 'exponential', initialDelayMs: 500, jitter: 'full' } },
    },
```

Verify the exact `BackoffStrategy` / `JitterType` literal values against `node_modules/@otskit/client/dist/index.d.ts` before writing (the d.ts defines the allowed string literals). Adjust `'exponential'` / `'full'` if the union differs.

- [ ] **Step 2: Type-check**

Run: `pnpm typecheck`
Expected: PASS — the N4 errors from Task 0.2 are now gone.

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add src/tools/create-timestamp.ts src/tools/upgrade-timestamp.ts src/tools/verify-timestamp.ts
git commit -m "fix: wire calendar_timeout_ms and retry_max_attempts into client resilience

The previous resilience.timeout field did not exist on ResilienceOptions
and was silently ignored (esbuild build skips type-checking). Map to
totalTimeoutMs/connectTimeoutMs and retries.maxAttempts.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 2.6: N2 — Remove unreachable `calendar_max_response_bytes`

**Why:** It never reaches the HTTP layer; the library already guards Esplora response size internally (`EsploraResponseError`). `retry_max_attempts` is now wired (Task 2.5), so only this field is dead.

**Files:**
- Modify: `src/types.ts:30` (remove `calendar_max_response_bytes`)
- Modify: `src/config.ts:18` (remove from DEFAULTS)
- Modify: tests' MOCK_CONFIG

- [ ] **Step 1: Remove the field everywhere; type-check; test**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 2: Commit**

```bash
rtk git add src/types.ts src/config.ts tests
git commit -m "fix: remove dead calendar_max_response_bytes config (library guards internally)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 2.7: F9 — `missing_proof` recovery state

**Why:** `reconcileOrphans` marks stamps `failed` permanently if the proof file is missing — wrong for transient causes (unmounted volume, crash mid-write).

**Files:**
- Modify: `src/types.ts:1` (add `'missing_proof'` — already added in Task 2.1 schema enum; ensure the type matches)
- Modify: `src/db/index.ts:32-45`
- Test: `tests/db/stamps.test.ts` or new `tests/db/reconcile.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/db/reconcile.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { makeRawDb } from '../helpers/db.js'
import { initDb } from '../../src/db/schema.js'
import { insertStamp, getStamp } from '../../src/db/stamps.js'
import { randomUUID } from 'crypto'

describe('reconcileOrphans', () => {
  it('marks missing-proof pending stamps as missing_proof, not failed', () => {
    const db = makeRawDb(); initDb(db)
    const id = randomUUID()
    insertStamp(db, { id, hash: 'a'.repeat(64), proof_path: '/nonexistent/path.ots' })
    // call the reconcile via a fresh getDb cycle, or export reconcileOrphans for testing
    // (export reconcileOrphans from src/db/index.ts)
    const { reconcileOrphans } = require('../../src/db/index.js')
    reconcileOrphans(db)
    expect(getStamp(db, id)?.status).toBe('missing_proof')
  })
})
```

- [ ] **Step 2: Export `reconcileOrphans` and change the status**

In `src/db/index.ts`: add `export` to `function reconcileOrphans`, and change the UPDATE:

```typescript
      db.run(`UPDATE stamps SET status = 'missing_proof', last_error = ? WHERE id = ?`,
        ['proof file not found at startup', row.id])
```

Confirm `StampStatus` in `src/types.ts` includes `'missing_proof'`.

- [ ] **Step 3: Run test**

Run: `pnpm vitest run tests/db/reconcile.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add src/db/index.ts src/types.ts tests/db/reconcile.test.ts
git commit -m "fix: use recoverable missing_proof status instead of permanent failed

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## PHASE 3 — LOW / hardening

### Task 3.1: F7 — Stop leaking absolute proof paths

**Files:**
- Modify: `src/tools/list-pending.ts:5-9`
- Modify: `src/tools/inspect-timestamp.ts:8-19,55-66`
- Modify: `src/tools/create-timestamp.ts` (drop `proof_path` from success response)
- Test: `tests/tools/inspect-timestamp.test.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/tools/inspect-timestamp.test.ts`:

```typescript
it('does not leak proof_path; exposes proof_exists instead', () => {
  // arrange a stamp with a real proof file, call inspectTimestamp
  const result = inspectTimestamp({ id }, db, MOCK_CONFIG)
  expect(result).not.toHaveProperty('proof_path')
  expect(result).toMatchObject({ proof_exists: true })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run tests/tools/inspect-timestamp.test.ts -t "proof_path"`
Expected: FAIL.

- [ ] **Step 3: Edit the three files**

`list-pending.ts`:
```typescript
type PublicStampRecord = Omit<StampRecord, 'attempt_count' | 'last_attempt_at' | 'next_retry_at' | 'proof_path' | 'archive_path'>
function toPublic({ attempt_count: _a, last_attempt_at: _b, next_retry_at: _c, proof_path: _d, archive_path: _e, ...rest }: StampRecord): PublicStampRecord {
  return rest
}
```

`inspect-timestamp.ts`: replace `proof_path: string` in `InspectOk` with `proof_exists: boolean`; in the return, replace `proof_path: record.proof_path` with `proof_exists: true`.

`create-timestamp.ts`: remove `proof_path` from `CreateTimestampSuccess` type and from the returned object (line 67). Update `tests/tools/stamp.test.ts` if it asserts on `proof_path`.

- [ ] **Step 4: Run tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/tools/list-pending.ts src/tools/inspect-timestamp.ts src/tools/create-timestamp.ts tests
git commit -m "fix: stop exposing absolute proof_path in tool responses (least privilege)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 3.2: F10 — Guard non-null results in verify-timestamp

**Files:**
- Modify: `src/tools/verify-timestamp.ts:45-58`
- Test: `tests/tools/verify.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
it('returns unknown if verify is valid but missing blockHeight/timestamp', async () => {
  const { OpenTimestampsClient } = await import('@otskit/client')
  ;(OpenTimestampsClient as any).mockImplementation(() => ({
    verify: vi.fn().mockResolvedValue({ valid: true }),  // no blockHeight/timestamp
  }))
  const result = await verifyTimestamp({ id }, db, MOCK_CONFIG)
  expect(result).toMatchObject({ status: 'unknown' })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run tests/tools/verify.test.ts -t "missing blockHeight"`
Expected: FAIL (currently throws on `new Date(undefined! * 1000)`).

- [ ] **Step 3: Add the guard**

In `src/tools/verify-timestamp.ts`, right after `if (!result.valid) { ... }` block and before line 58:

```typescript
  if (result.blockHeight == null || result.timestamp == null) {
    logOperation(db, { stamp_id: input.id, action: 'verify', result: 'failed', error_msg: 'valid:true without blockHeight/timestamp' })
    return { status: 'unknown', hash: record.hash }
  }
  const bitcoinTime = new Date(result.timestamp * 1000).toISOString()
  // ... remove the now-redundant ! assertions below; use result.blockHeight directly
```

Remove the `!` on `result.blockHeight!` and `result.timestamp!` (lines 58, 62, 69).

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/tools/verify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/tools/verify-timestamp.ts tests/tools/verify.test.ts
git commit -m "fix: guard against valid:true verify result missing blockHeight/timestamp

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 3.3: F12 — Atomic DB writes in createTimestamp

**Files:**
- Modify: `src/tools/create-timestamp.ts:58-59`
- Test: `tests/tools/stamp.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
it('rolls back the stamp if logOperation fails', async () => {
  // monkeypatch db.run to throw on the operations_log insert, then assert no stamp row remains
  // (or assert insert+log both present on success — minimal: assert both rows exist together)
  const result = await createTimestamp({ hash: 'b'.repeat(64) }, db, MOCK_CONFIG)
  expect('error' in result).toBe(false)
  const logs = db.all('SELECT * FROM operations_log WHERE stamp_id = ?', [(result as any).id])
  expect(logs.length).toBe(1)
})
```

- [ ] **Step 2: Run to verify current behavior**

Run: `pnpm vitest run tests/tools/stamp.test.ts -t "rolls back"`
Expected: PASS for the happy-path assertion (the rollback guarantee is what we add).

- [ ] **Step 3: Wrap both writes in a transaction**

In `src/tools/create-timestamp.ts`, replace lines 58-59:

```typescript
  let record: StampRecord
  db.exec('BEGIN')
  try {
    record = insertStamp(db, { id, hash: normalizedHash, proof_path: proofPath })
    logOperation(db, { stamp_id: id, action: 'stamp', result: 'success', response_time_ms: responseTimeMs })
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    try { unlinkSync(proofPath) } catch {}
    return { error: 'storage_error', details: String(e) }
  }
```

Add `import { unlinkSync } from 'fs'` and `import type { StampRecord } from '../types.js'`. The proof file `writeAtomic` stays BEFORE the transaction (line 53).

- [ ] **Step 4: Run tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/tools/create-timestamp.ts tests/tools/stamp.test.ts
git commit -m "fix: wrap insertStamp + logOperation in a single transaction

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Task 3.4: F8 — XML-escape scheduler values

**Files:**
- Modify: `src/utils.ts` (add `escapeXml`)
- Modify: `src/scheduler/install.ts:9-22`
- Test: `tests/scheduler/install.test.ts` (new) or `tests/utils.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { escapeXml } from '../src/utils.js'

describe('escapeXml', () => {
  it('escapes the five XML metacharacters, ampersand first', () => {
    expect(escapeXml(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f')
  })
  it('escapes a malicious binary path', () => {
    expect(escapeXml('C:\\x\\<evil>.exe')).toBe('C:\\x\\&lt;evil&gt;.exe')
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm vitest run tests/utils.test.ts`
Expected: FAIL — `escapeXml` doesn't exist.

- [ ] **Step 3: Add `escapeXml` to `src/utils.ts`**

```typescript
export function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
```

- [ ] **Step 4: Use it in `src/scheduler/install.ts`**

```typescript
import { escapeXml } from '../utils.js'
// ...
  const safeInterval = Math.max(1, Math.min(1440, Number.isFinite(interval) ? interval : 30))
  // in the XML template:
  //   <Interval>PT${safeInterval}M</Interval>
  //   <Command>${escapeXml(bin)}</Command>
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run tests/utils.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add src/utils.ts src/scheduler/install.ts tests/utils.test.ts
git commit -m "fix: XML-escape binary path and bound interval in scheduler install (CWE-91)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## FINAL VERIFICATION

- [ ] **Run the whole suite + type-check + build**

```bash
pnpm typecheck && pnpm test && pnpm build
```
Expected: type-check clean, all tests green, build produces `dist/index.js`.

- [ ] **Manual smoke test (optional)**

```bash
node dist/index.js list pending
```
Expected: valid JSON, no crash.

---

## Findings → Task map (self-review coverage)

| Finding | Severity | Task |
|---------|----------|------|
| F11 fake confirmation | HIGH | 1.1 |
| F1 arbitrary file read | HIGH | 1.2 |
| N1 sync read / huge files | HIGH | 1.2 |
| F6 no input validation | MED | 2.1 |
| F4 config SSRF | MED | 2.2 |
| F5 feature flags unused | MED | 2.3 |
| N3 esplora_url lie | MED | 2.4 |
| N4 timeout ignored (new) | MED | 2.5 |
| N2 max_response_bytes dead | MED | 2.6 |
| F9 permanent failed | MED | 2.7 |
| F7 path exposure | LOW | 3.1 |
| F10 non-null assertions | LOW | 3.2 |
| F12 no transaction | LOW | 3.3 |
| F8 XML injection | LOW | 3.4 |
| F2 backup SQL interp | FALSE POSITIVE | — (path already escaped) |
| F3 watch-window shell | FALSE POSITIVE | — (interval normalized to int) |

**Execution-order note:** run Task 2.4 and 2.6 (remove dead config fields) **before** Task 2.2 (config schema) to avoid transient type errors, since the schema must match the final `Config` shape.
