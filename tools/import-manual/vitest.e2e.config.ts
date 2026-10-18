import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * The real-Postgres e2e suite, separate from vitest.config.ts: it verifies
 * a whole import sequence against a real database and server, not line
 * coverage, so it carries no coverage threshold.
 */
export default defineConfig({
  oxc: false,
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    // Two full manual-import passes of the real curated data per run, twice.
    testTimeout: 900_000,
    hookTimeout: 900_000,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
