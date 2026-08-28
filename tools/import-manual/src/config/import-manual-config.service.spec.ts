import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    filePath: string,
  ): Promise<ImportManualConfigService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImportManualConfigService,
        { provide: IMPORT_MANUAL_CONFIG_PATH, useValue: filePath },
      ],
    }).compile();
    return moduleRef.get(ImportManualConfigService);
  }

  it('names this tool config file when connection is not set', async () => {
    const path = writeConfig(`{ }`);
    const service = await makeService(path);
    expect(() => service.getApiBaseUrl()).toThrow(
      'connection is not set in import-manual-config.json5',
    );
  });

  it('returns the default API base URL when connection is present but apiBaseUrl is unset', async () => {
    const service = await makeService(writeConfig(`{ connection: {} }`));
    expect(service.getApiBaseUrl()).toBe('http://localhost:3000');
  });

  it('returns the configured API token', async () => {
    const service = await makeService(
      writeConfig(`{ connection: { apiToken: 'manual-secret' } }`),
    );
    expect(service.getApiToken()).toBe('manual-secret');
  });

  it('names this tool api-token env var when apiToken is missing', async () => {
    const service = await makeService(
      writeConfig(`{ connection: { apiBaseUrl: 'http://x:3000' } }`),
    );
    expect(() => service.getApiToken()).toThrow(
      'connection.apiToken is not set in import-manual-config.json5. Set ' +
        'it to the bearer token this tool authenticates with; it must ' +
        'match the API_TOKEN_IMPORT_MANUAL value in apps/discord-bot/.env.',
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
