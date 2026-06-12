import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

function getConfigPath(): string {
  return join(homedir(), '.claude.json')
}

export function setupClaudeCode(): void {
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
      process.stderr.write(`  Aviso: no se pudo parsear la config existente, se creará nueva.\n`)
    }

    const existing = (config.mcpServers ?? {}) as Record<string, unknown>
    if ('otskit' in existing) {
      process.stdout.write(`  ots-mcp ya está configurado en ${configPath}\n`)
      process.stdout.write(`  No se hizo ningún cambio.\n`)
      return
    }

    const backupPath = configPath + '.bak'
    copyFileSync(configPath, backupPath)
    process.stdout.write(`  Backup guardado en ${backupPath}\n`)
  }

  const mcpServers = (config.mcpServers ?? {}) as Record<string, unknown>
  mcpServers['otskit'] = { command: 'npx', args: ['-y', '@otskit/mcp', 'serve'] }
  config.mcpServers = mcpServers

  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
  process.stdout.write(`OTSkit MCP configurado para Claude Code CLI\n`)
  process.stdout.write(`  Config: ${configPath}\n`)
  process.stdout.write(`  Reinicia Claude Code para aplicar los cambios.\n`)
}
