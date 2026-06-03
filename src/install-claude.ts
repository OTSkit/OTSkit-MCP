import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

function getConfigPath(): string {
  if (process.platform === 'win32') {
    return join(process.env.APPDATA ?? '', 'Claude', 'claude_desktop_config.json')
  } else if (process.platform === 'darwin') {
    return join(process.env.HOME ?? '', 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
  } else {
    return join(process.env.HOME ?? '', '.config', 'Claude', 'claude_desktop_config.json')
  }
}

export function installClaude(): void {
  const configPath = getConfigPath()
  const configDir = join(configPath, '..')

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  let config: Record<string, unknown> = {}
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8'))
    } catch {
      process.stderr.write(`Warning: could not parse existing config, creating new one\n`)
    }
  }

  const mcpServers = (config.mcpServers ?? {}) as Record<string, unknown>
  mcpServers['otskit'] = {
    command: 'npx',
    args: ['-y', '@otskit/mcp', 'serve'],
  }
  config.mcpServers = mcpServers

  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
  process.stdout.write(`✓ OTSkit MCP installed in Claude Desktop\n`)
  process.stdout.write(`  Config: ${configPath}\n`)
  process.stdout.write(`  Restart Claude Desktop to apply changes.\n`)
}
