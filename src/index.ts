#!/usr/bin/env node
const [,, command, ...args] = process.argv

if (!command || command === '--help' || command === 'help') {
  process.stderr.write(`Usage: ots-mcp <command>
Commands:
  serve           Start MCP server (stdio transport)
  install-claude  Install MCP in Claude Desktop config (auto-setup)
  stamp <hash>    Stamp a SHA-256 hash
  upgrade <id>    Upgrade a pending stamp
  verify <id>     Verify a stamp
  list [status]   List stamps (default: pending)
  check-pending   Run pending upgrades (for scheduler)
  backup [dest]   Backup the SQLite database
  scheduler       Manage OS scheduler (install|remove|status)
`)
  process.exit(command ? 0 : 1)
}

switch (command) {
  case 'serve': {
    const { runServer } = await import('./server.js')
    await runServer()
    break
  }
  case 'install-claude': {
    const { installClaude } = await import('./install-claude.js')
    installClaude()
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
