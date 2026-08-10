import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_IMPORT_TP_CONFIG_PATH,
  IMPORT_TP_CONFIG_PATH,
  ImportTpConfigService,
  PRODUCTION_IMPORT_TP_CONFIG_PATH,
  resolveImportTpConfigPath,
} from './import-tp-config.service';

describe('ImportTpConfigService', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'import-tp-config-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeConfig(contents: string): string {
    const path = join(dir, 'import-tp-config.json5');
    writeFileSync(path, contents, 'utf8');
    return path;
  }

  async function makeService(
    configPath: string,
  ): Promise<ImportTpConfigService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImportTpConfigService,
        { provide: IMPORT_TP_CONFIG_PATH, useValue: configPath },
      ],
    }).compile();
    return moduleRef.get(ImportTpConfigService);
  }

  it('treats a missing file as an empty config', async () => {
    const service = await makeService(join(dir, 'does-not-exist.json5'));
    expect(service.get('eras')).toBeUndefined();
    expect(service.get('connection')).toBeUndefined();
  });

  it('throws when the file is missing, since connection is not set', async () => {
    const service = await makeService(join(dir, 'does-not-exist.json5'));
    expect(() => service.getApiBaseUrl()).toThrow(
      'connection is not set in import-tp-config.json5',
    );
  });

  it('throws when connection is not set', async () => {
    const path = writeConfig(`{ dataDir: 'data', eras: [] }`);
    const service = await makeService(path);
    expect(() => service.getApiBaseUrl()).toThrow(
      'connection is not set in import-tp-config.json5',
    );
  });

  it('returns the default API base URL when connection is present but apiBaseUrl is unset', async () => {
    const path = writeConfig(`{ connection: {} }`);
    const service = await makeService(path);
    expect(service.getApiBaseUrl()).toBe('http://localhost:3000');
  });

  it('parses JSON5 (comments, trailing commas, unquoted keys) and returns parsed values', async () => {
    const path = writeConfig(`{
      // a comment
      connection: { apiBaseUrl: 'http://example.test:3000' },
      dataDir: 'data',
      eras: [
        { name: 'Fourth era', dataSubdir: 'fourth-era' },
      ],
    }`);
    const service = await makeService(path);
    expect(service.get<string>('dataDir')).toBe('data');
    expect(service.get<unknown[]>('eras')).toHaveLength(1);
    expect(service.getApiBaseUrl()).toBe('http://example.test:3000');
  });

  it('throws with the file path when the file is not valid JSON5', async () => {
    const path = writeConfig('{ this is : not valid');
    await expect(makeService(path)).rejects.toThrow(path);
  });

  it('returns the configured API token', async () => {
    const path = writeConfig(`{ connection: { apiToken: 'tp-secret' } }`);
    const service = await makeService(path);
    expect(service.getApiToken()).toBe('tp-secret');
  });

  it('throws from getApiToken when connection is not set', async () => {
    const path = writeConfig(`{ dataDir: 'data' }`);
    const service = await makeService(path);
    expect(() => service.getApiToken()).toThrow(
      'connection is not set in import-tp-config.json5',
    );
  });

  it('throws when apiToken is missing', async () => {
    const path = writeConfig(`{ connection: { apiBaseUrl: 'http://x:3000' } }`);
    const service = await makeService(path);
    expect(() => service.getApiToken()).toThrow(
      'connection.apiToken is not set in import-tp-config.json5',
    );
  });

  it('throws when apiToken is an empty string', async () => {
    const path = writeConfig(`{ connection: { apiToken: '' } }`);
    const service = await makeService(path);
    expect(() => service.getApiToken()).toThrow(
      'connection.apiToken is not set in import-tp-config.json5',
    );
  });

  it('throws when apiToken is not a string', async () => {
    const path = writeConfig(`{ connection: { apiToken: 42 } }`);
    const service = await makeService(path);
    expect(() => service.getApiToken()).toThrow(
      'connection.apiToken is not set in import-tp-config.json5',
    );
  });
});

describe('resolveImportTpConfigPath', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves the default config path when IMPORT_CONFIG_ENV is unset', () => {
    vi.stubEnv('IMPORT_CONFIG_ENV', undefined);
    expect(resolveImportTpConfigPath()).toBe(DEFAULT_IMPORT_TP_CONFIG_PATH);
  });

  it('resolves the default config path for a value other than production', () => {
    vi.stubEnv('IMPORT_CONFIG_ENV', 'staging');
    expect(resolveImportTpConfigPath()).toBe(DEFAULT_IMPORT_TP_CONFIG_PATH);
  });

  it('resolves the production config path when IMPORT_CONFIG_ENV is production', () => {
    vi.stubEnv('IMPORT_CONFIG_ENV', 'production');
    expect(resolveImportTpConfigPath()).toBe(PRODUCTION_IMPORT_TP_CONFIG_PATH);
  });

  it('points the two paths at sibling files in the working directory', () => {
    expect(DEFAULT_IMPORT_TP_CONFIG_PATH).toBe(
      resolve(process.cwd(), 'import-tp-config.json5'),
    );
    expect(PRODUCTION_IMPORT_TP_CONFIG_PATH).toBe(
      resolve(process.cwd(), 'import-tp-config.production.json5'),
    );
  });
});
