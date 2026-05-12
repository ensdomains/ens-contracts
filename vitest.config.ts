import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'test/**/*.test.ts',
      'test/reverseResolver/Test*.ts',
      'test/reverseRegistrar/Test*.ts',
      ...(process.env.TEST_REMOTE ? ['test/**/*.remote.ts'] : []),
    ],
    exclude: ['test/**/*.behaviour.ts'],
    reporters: ['verbose'],
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
  },
  esbuild: {
    target: 'node22',
    format: 'esm',
  },
})
