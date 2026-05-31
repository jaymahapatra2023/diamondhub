import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@diamondhub/contracts': resolve(__dirname, '../../packages/contracts/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    exclude: ['e2e/**', '**/node_modules/**'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['src/main.tsx', 'src/__tests__/**', '*.config.*', 'e2e/**'],
      thresholds: { lines: 75, functions: 75, branches: 65 },
    },
    testTimeout: 10000,
  },
})
