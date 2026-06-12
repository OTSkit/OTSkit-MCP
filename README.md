<p align="center">
  <img src="docs/header.png" alt="OTSkit MCP" width="480" />
</p>

# @otskit/mcp

[![CI](https://github.com/OTSkit/OTSkit-MCP/actions/workflows/ci.yml/badge.svg)](https://github.com/OTSkit/OTSkit-MCP/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@otskit/mcp.svg)](https://www.npmjs.com/package/@otskit/mcp)
[![npm downloads](https://img.shields.io/npm/dt/@otskit/mcp.svg)](https://www.npmjs.com/package/@otskit/mcp)
[![TypeScript](https://img.shields.io/npm/dependency-version/@otskit/mcp/dev/typescript?label=TypeScript)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/node/v/@otskit/mcp)](https://nodejs.org)
[![Coverage](https://codecov.io/gh/OTSkit/OTSkit-MCP/branch/main/graph/badge.svg)](https://codecov.io/gh/OTSkit/OTSkit-MCP)
[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=OTSkit_OTSkit-MCP&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=OTSkit_OTSkit-MCP)
[![License](https://img.shields.io/npm/l/@otskit/mcp)](LICENSE)
[![Glama](https://glama.ai/mcp/servers/OTSkit/OTSkit-MCP/badges/score.svg)](https://glama.ai/mcp/servers/OTSkit/OTSkit-MCP)
[![smithery badge](https://smithery.ai/badge/otskit/otskit-mcp)](https://smithery.ai/servers/otskit/otskit-mcp)

OpenTimestamps MCP server - stamp, upgrade, and verify Bitcoin timestamps via AI agents.

Exposes a set of tools to any MCP-compatible agent so it can timestamp documents, monitor confirmation status, and verify proofs against the Bitcoin blockchain - all from a conversation.

> **Note on confirmation times:** After stamping, a proof is `pending` until Bitcoin confirms it. Confirmations typically arrive within **~60 minutes**, but can take **several hours** during network congestion. Use `ots-mcp watch` or `upgrade_timestamp` to monitor. A pending proof is not a failed proof.

## Install

```bash
npm install -g @otskit/mcp
```

## Agent setup

```bash
ots-mcp setup claude        # Claude Desktop
ots-mcp setup claude-code   # Claude Code CLI
ots-mcp setup codex         # Codex CLI
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
| `ots-mcp watch [minutes]` | Monitor pending stamps and attempt due upgrades (default: 30 min, minimum: 15 min) |
| `ots-mcp check-pending` | Run one upgrade pass over all pending stamps |
| `ots-mcp scheduler install\|remove\|status` | Manage OS-level scheduler for auto-upgrades |
| `ots-mcp backup [dest]` | Backup the SQLite database |
| `ots-mcp setup <claude\|claude-code\|codex>` | Configure MCP for an agent |

## MCP tools exposed to agents

| Tool | Description |
|---|---|
| `create_timestamp` | Stamp a SHA-256 hash against 4 public OTS calendars |
| `upgrade_timestamp` | Check if a pending stamp has been confirmed in Bitcoin |
| `verify_timestamp` | Verify a stamp - proves hash existed before a given Bitcoin block |
| `inspect_timestamp` | Inspect a stored proof file without network calls |
| `list_pending` | List stamps with status, retry count, and filters |
| `watch` | Open a terminal window monitoring pending stamps and attempting due upgrades |
| `hash_file` | Compute the SHA-256 of a local file and return it as a 64-char hex string (no network calls) |
| `stamp_file` | Compute SHA-256 of a local file and stamp it on Bitcoin in one step |

## Data directory

All data is stored in `~/.ots-mcp/`:

```text
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

- [`@otskit/client`](https://github.com/OTSkit/OTSkit-client) - OTS calendar client (brings in [`@otskit/core`](https://github.com/OTSkit/OTSkit-core), the protocol engine)
- [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) - MCP SDK
- `node-sqlite3-wasm` - local database (pure WASM, no native compilation)

Requires Node.js >= 20.
