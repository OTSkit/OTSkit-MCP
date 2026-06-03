export async function runScheduler(args: string[]): Promise<void> {
  const [sub, ...rest] = args
  switch (sub) {
    case 'install': { const { installScheduler } = await import('./install.js'); await installScheduler(rest); break }
    case 'remove':  { const { removeScheduler }  = await import('./remove.js');  await removeScheduler();       break }
    case 'status':  { const { statusScheduler }  = await import('./status.js');  await statusScheduler();       break }
    default:
      process.stderr.write('Usage: ots-mcp scheduler install [--interval N] | remove | status\n')
      process.exit(1)
  }
}
