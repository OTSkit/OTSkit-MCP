import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const BLOCK = `
[mcp_servers.ots-mcp]
command = "npx"
args = ["-y", "@otskit/mcp", "serve"]
`

export function setupCodex(): void {
  const configPath = join(homedir(), '.codex', 'config.toml')
  const configDir = join(configPath, '..')

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  let content = ''

  if (existsSync(configPath)) {
    content = readFileSync(configPath, 'utf8')

    if (content.includes('[mcp_servers.ots-mcp]')) {
      process.stdout.write(`  ots-mcp ya está configurado en ${configPath}\n`)
      process.stdout.write(`  No se hizo ningún cambio.\n`)
      return
    }

    const backupPath = configPath + '.bak'
    copyFileSync(configPath, backupPath)
    process.stdout.write(`  Backup guardado en ${backupPath}\n`)
  }

  writeFileSync(configPath, content.trimEnd() + '\n' + BLOCK, 'utf8')
  process.stdout.write(`OTSkit MCP configurado para Codex\n`)
  process.stdout.write(`  Config: ${configPath}\n`)
  process.stdout.write(`  Reinicia Codex para aplicar los cambios.\n`)
}
