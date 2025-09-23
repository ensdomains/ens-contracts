import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/Test*.remote.ts'],
    exclude: ['test/setup.ts'],
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    env: {
      FORKING_ENABLED: '1',
    },
  },
  esbuild: {
    target: 'node22',
    format: 'esm',
  },
})
