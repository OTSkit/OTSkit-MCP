import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { getDb } from './db/index.js'
import { loadConfig } from './config.js'
import { createTimestamp } from './tools/create-timestamp.js'
import { upgradeTimestamp } from './tools/upgrade-timestamp.js'
import { verifyTimestamp } from './tools/verify-timestamp.js'
import { inspectTimestamp } from './tools/inspect-timestamp.js'
import { listPending } from './tools/list-pending.js'
import { preserve } from './tools/preserve.js'
import { TOOL_DEFINITIONS } from './tool-definitions.js'

export async function runServer(): Promise<void> {
  const config = loadConfig()
  const db = getDb()

  const server = new Server(
    { name: 'ots-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    try {
      let result: unknown
      switch (name) {
        case 'create_timestamp':  result = await createTimestamp(args as any, db, config); break
        case 'upgrade_timestamp': result = await upgradeTimestamp(args as any, db, config); break
        case 'verify_timestamp':  result = await verifyTimestamp(args as any, db, config); break
        case 'inspect_timestamp': result = inspectTimestamp(args as any, db, config); break
        case 'list_pending':      result = listPending(args as any, db, config); break
        case 'preserve':          result = await preserve(args as any, db, config); break
        default:
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'unknown_tool', tool: name }) }], isError: true }
      }
      const isError = Boolean(result && typeof result === 'object' && 'error' in result)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError }
    } catch (e) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'internal_error', details: String(e) }) }], isError: true }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
