#!/usr/bin/env node
const [, , command, ...args] = process.argv

if (!command || command === '--help' || command === 'help') {
  process.stderr.write(`Usage: ots-mcp <command>
Commands:
  serve              Start MCP server (stdio transport)
  setup <target>     Configure MCP for an agent (claude | claude-code | codex)
  watch [interval]   Watch and upgrade due pending stamps (default: 30 min, minimum: 15 min)
  stamp <hash>       Stamp a SHA-256 hash
  upgrade <id>       Upgrade a pending stamp
  verify <id>        Verify a stamp
  list [status]      List stamps (default: pending)
  check-pending      Run pending upgrades (for scheduler)
  backup [dest]      Backup the SQLite database
  scheduler          Manage OS scheduler (install|remove|status)
`)
  process.exit(command ? 0 : 1)
}

switch (command) {
  case 'serve': {
    const { runServer } = await import('./server.js')
    await runServer()
    break
  }
  case 'setup': {
    const target = args[0]
    if (!target || (target !== 'claude' && target !== 'claude-code' && target !== 'codex')) {
      process.stderr.write(`Usage: ots-mcp setup <claude|claude-code|codex>\n`)
      process.exit(1)
    }
    if (target === 'claude') {
      const { setupClaude } = await import('./setup/claude.js')
      setupClaude()
    } else if (target === 'claude-code') {
      const { setupClaudeCode } = await import('./setup/claude-code.js')
      setupClaudeCode()
    } else {
      const { setupCodex } = await import('./setup/codex.js')
      setupCodex()
    }
    break
  }
  case 'install-claude': {
    const { installClaude } = await import('./install-claude.js')
    installClaude()
    break
  }
  case 'watch': {
    const { normalizeWatchInterval, watchPending } = await import('./tools/watch.js')
    const parsed = args[0] ? parseInt(args[0], 10) : NaN
    const interval = normalizeWatchInterval(isNaN(parsed) ? undefined : parsed)
    if (args[0] && (isNaN(parsed) || parsed < 15))
      process.stderr.write(`Invalid interval "${args[0]}", using ${interval} min\n`)
    await watchPending(interval)
    break
  }
  case 'stamp':
  case 'upgrade':
  case 'verify':
  case 'list':
  case 'check-pending':
  case 'backup':
  case 'scheduler': {
    const { runCli } = await import('./cli.js')
    await runCli(command, args)
    break
  }
  default: {
    process.stderr.write(`Unknown command: ${command}. Run 'ots-mcp help' for usage.\n`)
    process.exit(1)
  }
}
