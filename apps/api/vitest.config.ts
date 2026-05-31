import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@diamondhub/contracts': resolve(__dirname, '../../packages/contracts/src/index.ts'),
      '@diamondhub/db': resolve(__dirname, '../../packages/db/src/index.ts'),
      '@diamondhub/workers': resolve(__dirname, '../../packages/workers/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      threshold: { lines: 80, functions: 80, branches: 70 },
      exclude: ['src/index.ts', 'src/__tests__/**'],
    },
    testTimeout: 10000,
  },
})
