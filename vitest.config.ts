import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'test/**/*.test.ts',
      'test/reverseResolver/Test*.ts',
      'test/reverseRegistrar/Test*.ts',
      'test/utils/TestFeatures.ts',
    ],
    exclude: [
      'test/setup.ts',
      'test/**/*.behaviour.ts',
      'test/**/fixtures/**',
      'test/universalResolver/mainnet.ts',
      'test/universalResolver/TestUniversalResolver.remote.ts',
    ],
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
  },
  esbuild: {
    target: 'node22',
    format: 'esm',
  },
})
