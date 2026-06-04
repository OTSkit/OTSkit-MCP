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
    description: 'Inspects a stored proof file without network calls. Returns calendar_attestations (promises from OTS servers, NOT Bitcoin confirmation) and bitcoin_attestations (actual Bitcoin blocks). A stamp is only truly confirmed when bitcoin_attestations > 0 and bitcoin_confirmed is true.',
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
    name: 'watch',
    description: 'Opens a new terminal window that monitors pending stamps in real-time, polling at the given interval. The window stays open so the user can watch progress.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        interval_minutes: { type: 'number', description: 'Polling interval in minutes (default: 5, minimum: 1)' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
]
