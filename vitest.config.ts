import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Most tests are pure and run in node. Component tests declare
 * `@vitest-environment jsdom` in a docblock — they need a DOM because the bugs
 * worth catching there only appear when real key events meet a real input.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@core': resolve('src/core'),
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer')
    }
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node'
  }
})
