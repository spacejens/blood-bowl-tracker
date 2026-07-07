import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      all: true,
      include: ['src/**/*.ts'],
      // api-client-config.service.ts is excluded alongside *.module.ts:
      // Vite's OXC-based decorator transform emits a
      // `typeof ConfigService === "undefined" ? Object : ConfigService`
      // ternary for `design:paramtypes` metadata on any @Injectable() class
      // with a class-typed constructor parameter. That "undefined" branch
      // is unreachable dead code introduced by the dev/test transform only
      // (verified clean against this package's actual `tsc` build output,
      // which has no such check). @vitest/coverage-v8 already special-cases
      // this exact pattern for SWC's `_ts_decorate` helper but not yet for
      // Vite 8's OXC `_decorate`/`_decorateMetadata` helpers, so it leaks
      // through as an uncoverable branch here. Per-file threshold overrides
      // don't help: per Vitest's docs, files matched by a glob-specific
      // threshold still count toward the global aggregate.
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.module.ts',
        'src/api-client-config.service.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
