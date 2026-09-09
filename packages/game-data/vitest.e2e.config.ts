import { defineConfig } from 'vitest/config';

/**
 * The real-Postgres e2e suite, deliberately separate from vitest.config.ts:
 * these tests verify database behavior, not line coverage, so they carry no
 * coverage threshold and never mix with the 90%-threshold unit run.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // Every spec file shares the one container for the run, and each resets
    // the whole game_data schema between tests, so two files running at once
    // would truncate each other's rows mid-test.
    fileParallelism: false,
    // Container start, migration and connection are all far slower than a
    // mocked-db unit test.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
