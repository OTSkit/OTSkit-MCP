import type { Config } from './types.js'

const STAMP_TOOLS = new Set([
  'create_timestamp', 'upgrade_timestamp', 'verify_timestamp',
  'inspect_timestamp', 'list_pending', 'stamp_file', 'hash_file', 'watch',
])
const PRESERVE_TOOLS = new Set(['stamp_file'])

// Single dispatch-layer gate for feature flags, so each handler doesn't repeat
// (and risk forgetting) the check. Returns an error object to surface, or null.
export function featureDisabledError(
  name: string,
  config: Config
): { error: 'feature_disabled'; feature: string } | null {
  if (STAMP_TOOLS.has(name) && !config.stamp_enabled) return { error: 'feature_disabled', feature: 'stamp' }
  if (PRESERVE_TOOLS.has(name) && !config.preserve_enabled) return { error: 'feature_disabled', feature: 'preserve' }
  return null
}
