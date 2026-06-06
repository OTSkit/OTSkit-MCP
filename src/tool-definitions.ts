export const TOOL_DEFINITIONS = [
  {
    name: 'create_timestamp',
    description: 'Creates a verifiable Bitcoin timestamp for a SHA-256 hash using the OpenTimestamps protocol. Submits the hash to four public OTS calendars (alice.btc, bob.btc, finney, catallaxy) and stores a pending proof locally. Returns a stamp ID to track confirmation status. Confirmation typically takes ~60 minutes but can take several hours during network congestion.',
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
    description: 'Attempts to upgrade a pending OpenTimestamps proof by fetching the latest merkle tree from the calendars. If Bitcoin has included the timestamp, the proof becomes confirmed and the bitcoin_block is recorded. Safe to call repeatedly — if not yet confirmed, it schedules the next retry automatically.',
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
    description: 'Verifies a timestamp proof against the Bitcoin blockchain via an Esplora API. Proves that a specific hash existed before a given Bitcoin block height. Does NOT affirm document authorship, content truth, or legal validity — it only provides a cryptographic proof of existence at a point in time.',
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
    description: 'Reads a stored proof file from disk without any network calls. Returns proof metadata including size, number of calendar attestations (pending promises from OTS servers) and Bitcoin attestations (actual confirmed blocks). A stamp is only truly confirmed when bitcoin_attestations > 0 and bitcoin_confirmed is true — calendar_attestations alone do not prove Bitcoin confirmation.',
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
    description: 'Lists stamp records from the local database with their current status, retry count, and next scheduled upgrade time. Filter by status (pending, confirmed, failed), page through results, or find stamps older than N hours. Use this to monitor the state of all timestamped hashes.',
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
    name: 'hash_file',
    description: 'Computes the SHA-256 hash of a local file and returns it as a 64-character hex string. Purely local — no network calls, no data stored. Use this to get the hash before calling create_timestamp, or to verify the integrity of a file independently.',
    inputSchema: {
      type: 'object' as const,
      properties: { path: { type: 'string', description: 'Absolute path to the file' } },
      required: ['path'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'stamp_file',
    description: 'Convenience tool that hashes a local file and stamps it on Bitcoin in one step. Computes the SHA-256 of the file, then submits it to four public OTS calendars. The file contents are never sent externally — only the hash is. Returns a stamp ID for tracking confirmation.',
    inputSchema: {
      type: 'object' as const,
      properties: { path: { type: 'string', description: 'Absolute path to the file to stamp' } },
      required: ['path'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'watch',
    description: 'Opens a new terminal window that continuously monitors pending stamps and attempts due upgrades at each interval. Useful for long-running monitoring sessions after stamping. The window remains open so the user can watch confirmation progress in real time. Minimum interval is 15 minutes to avoid hammering OTS calendars.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        interval_minutes: { type: 'number', description: 'Polling interval in minutes (default: 30, minimum: 15)' },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
]
