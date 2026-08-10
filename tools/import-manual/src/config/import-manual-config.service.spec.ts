import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock node:fs, wrapping actual implementations to allow spying on readFileSync
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    chmodSync: actual.chmodSync,
    mkdtempSync: actual.mkdtempSync,
    rmSync: actual.rmSync,
    writeFileSync: actual.writeFileSync,
    readFileSync: vi.fn(actual.readFileSync),
  };
});

import * as fsModule from 'node:fs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';

import {
  DEFAULT_IMPORT_MANUAL_CONFIG_PATH,
  IMPORT_MANUAL_CONFIG_PATH,
  ImportManualConfigService,
  PRODUCTION_IMPORT_MANUAL_CONFIG_PATH,
  resolveImportManualConfigPath,
} from './import-manual-config.service';

describe('ImportManualConfigService', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'import-manual-config-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeConfig(contents: string): string {
    const path = join(dir, 'import-manual-config.json5');
    writeFileSync(path, contents, 'utf8');
    return path;
  }

  async function makeService(
    configPath: string,
  ): Promise<ImportManualConfigService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImportManualConfigService,
        { provide: IMPORT_MANUAL_CONFIG_PATH, useValue: configPath },
      ],
    }).compile();
    return moduleRef.get(ImportManualConfigService);
  }

  it('treats a missing file as an empty config', async () => {
    const service = await makeService(join(dir, 'does-not-exist.json5'));
    expect(service.get('connection')).toBeUndefined();
  });

  it('throws when the file is missing, since connection is not set', async () => {
    const service = await makeService(join(dir, 'does-not-exist.json5'));
    expect(() => service.getApiBaseUrl()).toThrow(
      'connection is not set in import-manual-config.json5',
    );
  });

  it('throws when connection is not set', async () => {
    const path = writeConfig(`{ }`);
    const service = await makeService(path);
    expect(() => service.getApiBaseUrl()).toThrow(
      'connection is not set in import-manual-config.json5',
    );
  });

  it('returns the default API base URL when connection is present but apiBaseUrl is unset', async () => {
    const path = writeConfig(`{ connection: {} }`);
    const service = await makeService(path);
    expect(service.getApiBaseUrl()).toBe('http://localhost:3000');
  });

  it('parses JSON5 and returns the configured API base URL', async () => {
    const path = writeConfig(`{
      // a comment
      connection: { apiBaseUrl: 'http://example.test:3000' },
    }`);
    const service = await makeService(path);
    expect(service.getApiBaseUrl()).toBe('http://example.test:3000');
  });

  it('throws with the file path when the file is not valid JSON5', async () => {
    const path = writeConfig('{ this is : not valid');
    await expect(makeService(path)).rejects.toThrow(path);
  });

  it('throws when the config file cannot be read due to a non-ENOENT error', async () => {
    const path = join(dir, 'import-manual-config.json5');
    writeFileSync(path, '{ connection: {} }', 'utf8');

    // Mock readFileSync to throw EACCES error (deterministic, works on all platforms/users)
    const fsMocked = vi.mocked(fsModule);
    fsMocked.readFileSync.mockImplementation(() => {
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      throw error;
    });

    try {
      await expect(makeService(path)).rejects.toThrow();
    } finally {
      fsMocked.readFileSync.mockRestore();
    }
  });

  it('returns the configured API token', async () => {
    const path = writeConfig(`{ connection: { apiToken: 'manual-secret' } }`);
    const service = await makeService(path);
    expect(service.getApiToken()).toBe('manual-secret');
  });

  it('throws from getApiToken when connection is not set', async () => {
    const path = writeConfig(`{}`);
    const service = await makeService(path);
    expect(() => service.getApiToken()).toThrow(
      'connection is not set in import-manual-config.json5',
    );
  });

  it('throws when apiToken is missing', async () => {
    const path = writeConfig(`{ connection: { apiBaseUrl: 'http://x:3000' } }`);
    const service = await makeService(path);
    expect(() => service.getApiToken()).toThrow(
      'connection.apiToken is not set in import-manual-config.json5',
    );
  });

  it('throws when apiToken is an empty string', async () => {
    const path = writeConfig(`{ connection: { apiToken: '' } }`);
    const service = await makeService(path);
    expect(() => service.getApiToken()).toThrow(
      'connection.apiToken is not set in import-manual-config.json5',
    );
  });

  it('throws when apiToken is not a string', async () => {
    const path = writeConfig(`{ connection: { apiToken: 42 } }`);
    const service = await makeService(path);
    expect(() => service.getApiToken()).toThrow(
      'connection.apiToken is not set in import-manual-config.json5',
    );
  });
});

describe('resolveImportManualConfigPath', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves the default config path when IMPORT_CONFIG_ENV is unset', () => {
    vi.stubEnv('IMPORT_CONFIG_ENV', undefined);
    expect(resolveImportManualConfigPath()).toBe(
      DEFAULT_IMPORT_MANUAL_CONFIG_PATH,
    );
  });

  it('resolves the default config path for a value other than production', () => {
    vi.stubEnv('IMPORT_CONFIG_ENV', 'staging');
    expect(resolveImportManualConfigPath()).toBe(
      DEFAULT_IMPORT_MANUAL_CONFIG_PATH,
    );
  });

  it('resolves the production config path when IMPORT_CONFIG_ENV is production', () => {
    vi.stubEnv('IMPORT_CONFIG_ENV', 'production');
    expect(resolveImportManualConfigPath()).toBe(
      PRODUCTION_IMPORT_MANUAL_CONFIG_PATH,
    );
  });

  it('points the two paths at sibling files in the working directory', () => {
    expect(DEFAULT_IMPORT_MANUAL_CONFIG_PATH).toBe(
      resolve(process.cwd(), 'import-manual-config.json5'),
    );
    expect(PRODUCTION_IMPORT_MANUAL_CONFIG_PATH).toBe(
      resolve(process.cwd(), 'import-manual-config.production.json5'),
    );
  });
});
