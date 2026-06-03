export const TOOL_DEFINITIONS = [
  {
    name: 'create_timestamp',
    description: 'Stamps a SHA-256 hash against public OpenTimestamps calendars. IMPORTANT: the digest is sent to external calendar servers (alice.btc, bob.btc, finney, catallaxy).',
    inputSchema: {
      type: 'object' as const,
      properties: { hash: { type: 'string', description: 'SHA-256 hex digest (64 chars)' } },
      required: ['hash'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'upgrade_timestamp',
    description: 'Checks if a pending stamp has been confirmed in Bitcoin. Use the id returned by create_timestamp.',
    inputSchema: {
      type: 'object' as const,
      properties: { id: { type: 'string', description: 'UUID from the stamp record' } },
      required: ['id'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'verify_timestamp',
    description: 'Verifies a stamp against Bitcoin. Does NOT affirm document authorship or truth — only proves the hash existed before a given Bitcoin block.',
    inputSchema: {
      type: 'object' as const,
      properties: { id: { type: 'string', description: 'UUID from the stamp record' } },
      required: ['id'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'inspect_timestamp',
    description: 'Shows the contents of a stored proof file without making any network calls. Useful for debugging: returns size, parsed attestations, and confirmation status from the proof itself.',
    inputSchema: {
      type: 'object' as const,
      properties: { id: { type: 'string', description: 'UUID from the stamp record' } },
      required: ['id'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'list_pending',
    description: 'Lists stamp records with status and retry info.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['pending', 'confirmed', 'failed', 'timeout'] },
        limit:  { type: 'number', maximum: 200 },
        offset: { type: 'number' },
        older_than_hours: { type: 'number' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'preserve',
    description: 'FILESYSTEM-SENSITIVE: Compresses a directory to ZIP, stamps its SHA-256 hash, stores archive in whitelist directory. Requires preserve_whitelist config.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        dir_path: { type: 'string', description: 'Absolute path to directory (must be in preserve_whitelist)' },
        label:    { type: 'string', description: 'Optional label for the archive filename' },
      },
      required: ['dir_path'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
]
