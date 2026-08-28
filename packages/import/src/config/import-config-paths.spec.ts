import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createImportConfigPaths } from './import-config-paths';

describe('createImportConfigPaths', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves both paths as siblings in the working directory', () => {
    const paths = createImportConfigPaths('import-bbl-config');
    expect(paths.defaultPath).toBe(
      resolve(process.cwd(), 'import-bbl-config.json5'),
    );
    expect(paths.productionPath).toBe(
      resolve(process.cwd(), 'import-bbl-config.production.json5'),
    );
  });

  it('resolves the default path when IMPORT_CONFIG_ENV is unset', () => {
    vi.stubEnv('IMPORT_CONFIG_ENV', undefined);
    const paths = createImportConfigPaths('import-tp-config');
    expect(paths.resolvePath()).toBe(paths.defaultPath);
  });

  it('resolves the default path for a value other than production', () => {
    vi.stubEnv('IMPORT_CONFIG_ENV', 'staging');
    const paths = createImportConfigPaths('import-tp-config');
    expect(paths.resolvePath()).toBe(paths.defaultPath);
  });

  it('resolves the production path when IMPORT_CONFIG_ENV is production', () => {
    vi.stubEnv('IMPORT_CONFIG_ENV', 'production');
    const paths = createImportConfigPaths('import-manual-config');
    expect(paths.resolvePath()).toBe(paths.productionPath);
  });
});
