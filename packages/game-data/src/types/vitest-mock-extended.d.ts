/**
 * Local type shim for `vitest-mock-extended`'s `mock()` export.
 *
 * The package's shipped declarations (`lib/esm/index.d.ts`) re-export from
 * sibling files using extensionless relative specifiers (`./Mock`, not
 * `./Mock.js`), which is invalid under Node ESM resolution. Under this
 * package's `"module": "nodenext"` / `"moduleResolution": "nodenext"`
 * TypeScript config, that makes every named import from the real package
 * fail to resolve (`TS2305: has no exported member 'mock'`), even though the
 * runtime import works fine (Vite/Vitest use their own bundler resolution,
 * not `tsc`'s). This shim redeclares just the `mock()` signature this
 * package actually uses, matching `vitest-mock-extended`'s real runtime
 * behavior, so `tsc` can type-check without hitting the broken re-exports.
 * See `tsconfig.json`'s `paths` entry that redirects the module specifier
 * here.
 */
declare module 'vitest-mock-extended' {
  export interface MockOpts {
    deep?: boolean;
    useActualToJSON?: boolean;
    fallbackMockImplementation?: (...args: unknown[]) => unknown;
  }

  export function mock<T, MockedReturn = T>(
    mockImplementation?: Partial<T>,
    opts?: MockOpts,
  ): MockedReturn;
}
