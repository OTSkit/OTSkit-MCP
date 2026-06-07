import { z } from 'zod'

// Boundary validation for MCP tool inputs. This enforces TYPES, structure and
// numeric ranges (preventing type confusion, unknown-key injection and
// pagination DoS). Semantic format checks (hex64 hash, uuid id) are left to the
// handlers, which return informative domain errors (invalid_hash, not_found).
export function parse<T>(schema: z.ZodType<T>, args: unknown): T {
  const r = schema.safeParse(args ?? {})
  if (!r.success) {
    const msg = r.error.issues[0]?.message ?? 'invalid input'
    throw new Error(`invalid_params: ${msg}`)
  }
  return r.data
}

export const HashInput = z.strictObject({ hash: z.string() })
export const IdInput   = z.strictObject({ id: z.string().min(1) })
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
