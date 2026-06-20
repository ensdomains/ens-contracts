import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'test/**/*.test.ts',
      'test/reverseResolver/Test*.ts',
      'test/reverseRegistrar/Test*.ts',
      ...(process.env.TEST_REMOTE ? ['test/**/*.remote.ts'] : []),
    ],
    exclude: [
      'test/**/*.behaviour.ts',
      // SNRC does not include DNS integration — both `dnsregistrar/` and
      // `dnssec-oracle/` are listed as dropped in snrc-implementation-plan.md.
      // The corresponding test suites still live in the fork but exercise
      // upstream paths we don't deploy or maintain. Skip them so a clean run
      // doesn't surface failures in code outside our audit surface.
      'test/dnssec-oracle/**',
      'test/dnsregistrar/**',
      'test/resolvers/TestExtendedDNSResolver.test.ts',
      // The upstream NameWrapper / ETHRegistrarController / BulkRenewal /
      // MigrationHelper subsystem is kept for parity with `simplex` but is not
      // part of the wrapper-free redesign and is excluded from the build, so its
      // tests can't run. See the dead-code exclusion in hardhat.config.ts.
      'test/wrapper/**',
      'test/ethregistrar/TestBulkRenewal.test.ts',
      'test/ethregistrar/TestEthRegistrarController.test.ts',
      'test/ethregistrar/TestStaticBulkRenewal.test.ts',
      'test/utils/TestMigrationHelper.test.ts',
    ],
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
