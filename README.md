<p align="center">
  <img src="https://raw.githubusercontent.com/OTSkit/OTSkit-MCP/master/docs/header.png" alt="OTSkit.ts MCP" width="480" />
</p>

# @otskit/mcp

OpenTimestamps MCP server — stamp, upgrade, and verify Bitcoin timestamps via AI agents.

Exposes a set of tools to any MCP-compatible agent so it can timestamp documents, monitor confirmation status, and verify proofs against the Bitcoin blockchain — all from a conversation.

> **Note on confirmation times:** After stamping, a proof is `pending` until Bitcoin confirms it. This typically takes **10–60 minutes** but can take **several hours** during network congestion. Use `ots-mcp watch` or `upgrade_timestamp` to monitor. A pending status is not an error.

## Install

```bash
npm install -g @otskit/mcp
```

## Agent setup

```bash
ots-mcp setup claude   # Claude Desktop
ots-mcp setup codex    # Codex CLI
```

Each command writes the MCP entry into the agent's config file, makes a `.bak` backup if the file already exists, and skips if `ots-mcp` is already configured. Restart the agent afterwards to apply the changes.

## CLI commands

| Command | Description |
|---|---|
| `ots-mcp serve` | Start the MCP server (stdio transport) |
| `ots-mcp stamp <sha256>` | Stamp a SHA-256 hash against Bitcoin calendars |
| `ots-mcp upgrade <id>` | Check if a pending stamp has been confirmed |
| `ots-mcp verify <id>` | Verify a stamp against Bitcoin |
| `ots-mcp list [status]` | List stamps (`pending` / `confirmed` / `failed`) |
| `ots-mcp watch [minutes]` | Poll pending stamps in real-time (default: 5 min) |
| `ots-mcp check-pending` | Run one upgrade pass over all pending stamps |
| `ots-mcp scheduler install\|remove\|status` | Manage OS-level scheduler for auto-upgrades |
| `ots-mcp backup [dest]` | Backup the SQLite database |
| `ots-mcp setup <claude\|codex>` | Configure MCP for an agent |

## MCP tools exposed to agents

| Tool | Description |
|---|---|
| `create_timestamp` | Stamp a SHA-256 hash against 4 public OTS calendars |
| `upgrade_timestamp` | Check if a pending stamp has been confirmed in Bitcoin |
| `verify_timestamp` | Verify a stamp — proves hash existed before a given Bitcoin block |
| `inspect_timestamp` | Inspect a stored proof file without network calls |
| `list_pending` | List stamps with status, retry count, and filters |
| `watch` | Open a terminal window monitoring pending stamps in real-time |

## Data directory

All data is stored in `~/.ots-mcp/`:

```
~/.ots-mcp/
  ots-mcp.db       # SQLite database (stamps, proof files)
  config.json      # Optional config overrides
  ots-mcp.log      # Log file
```

## Configuration

Create `~/.ots-mcp/config.json` to override defaults:

```json
{
  "stamp_enabled": true,
  "scheduler_interval_minutes": 30,
  "retry_max_attempts": 20,
  "calendar_timeout_ms": 10000,
  "esplora_url": "https://blockstream.info/api",
  "calendars": [
    "https://alice.btc.calendar.opentimestamps.org",
    "https://bob.btc.calendar.opentimestamps.org",
    "https://finney.calendar.eternitywall.com",
    "https://btc.calendar.catallaxy.com"
  ]
}
```

## Development

```bash
npm run build    # production build
npm run dev      # watch mode
npm test         # run tests
```

## Dependencies

- [`@otskit/core`](https://github.com/AlexAlves87/otskit-core) — OpenTimestamps core logic
- [`@otskit/client`](https://github.com/AlexAlves87/otskit-client) — OTS calendar client
- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) — MCP SDK
- `better-sqlite3` — local database
