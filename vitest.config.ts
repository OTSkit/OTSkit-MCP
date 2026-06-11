import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    exclude: ['**/node_modules/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/db/driver.ts',  // TypeScript interface definitions — no runtime code
        'src/index.ts',      // CLI entry point (top-level await, process.argv) — integration-tested only
        'src/types.ts',      // TypeScript type aliases and interfaces only — no runtime code
      ],
    },
  },
})
