import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createImportConfigServiceBase } from './import-config-service-base';

const TEST_CONFIG_PATH = Symbol('TEST_CONFIG_PATH');

@Injectable()
class TestImportConfigService extends createImportConfigServiceBase({
  pathToken: TEST_CONFIG_PATH,
  fileBaseName: 'import-test-config',
  apiTokenEnvVar: 'API_TOKEN_IMPORT_TEST',
}) {}

describe('createImportConfigServiceBase', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'import-config-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeConfig(contents: string): string {
    const path = join(dir, 'import-test-config.json5');
    writeFileSync(path, contents, 'utf8');
    return path;
  }

  async function makeService(
    filePath: string,
  ): Promise<TestImportConfigService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TestImportConfigService,
        { provide: TEST_CONFIG_PATH, useValue: filePath },
      ],
    }).compile();
    return moduleRef.get(TestImportConfigService);
  }

  it('exposes raw top-level values through the config-loader base', async () => {
    const path = writeConfig(`{ league: { leagueName: 'tLoEG' } }`);
    const service = await makeService(path);
    expect(service.get<{ leagueName: string }>('league')?.leagueName).toBe(
      'tLoEG',
    );
  });

  it('throws when the file is missing, since connection is not set', async () => {
    const service = await makeService(join(dir, 'does-not-exist.json5'));
    expect(() => service.getApiBaseUrl()).toThrow(
      'connection is not set in import-test-config.json5',
    );
  });

  it('throws when connection is not set', async () => {
    const service = await makeService(writeConfig(`{ league: {} }`));
    expect(() => service.getApiBaseUrl()).toThrow(
      'connection is not set in import-test-config.json5',
    );
  });

  it('throws from getApiToken when connection is not set', async () => {
    const service = await makeService(writeConfig(`{ league: {} }`));
    expect(() => service.getApiToken()).toThrow(
      'connection is not set in import-test-config.json5',
    );
  });

  it('names the api base url default in the connection error', async () => {
    const service = await makeService(writeConfig(`{}`));
    expect(() => service.getApiBaseUrl()).toThrow(
      '(apiBaseUrl itself defaults to http://localhost:3000 if omitted).',
    );
  });

  it('defaults the API base URL when connection is present but apiBaseUrl is unset', async () => {
    const service = await makeService(writeConfig(`{ connection: {} }`));
    expect(service.getApiBaseUrl()).toBe('http://localhost:3000');
  });

  it('returns the configured API base URL', async () => {
    const service = await makeService(
      writeConfig(`{ connection: { apiBaseUrl: 'http://example.test:3000' } }`),
    );
    expect(service.getApiBaseUrl()).toBe('http://example.test:3000');
  });

  it('returns the configured API token', async () => {
    const service = await makeService(
      writeConfig(`{ connection: { apiToken: 'test-secret' } }`),
    );
    expect(service.getApiToken()).toBe('test-secret');
  });

  it('names the tool env var when apiToken is missing', async () => {
    const service = await makeService(
      writeConfig(`{ connection: { apiBaseUrl: 'http://x:3000' } }`),
    );
    expect(() => service.getApiToken()).toThrow(
      'connection.apiToken is not set in import-test-config.json5. Set it to ' +
        'the bearer token this tool authenticates with; it must match the ' +
        'API_TOKEN_IMPORT_TEST value in apps/discord-bot/.env.',
    );
  });

  it('throws when apiToken is an empty string', async () => {
    const service = await makeService(
      writeConfig(`{ connection: { apiToken: '' } }`),
    );
    expect(() => service.getApiToken()).toThrow(
      'connection.apiToken is not set in import-test-config.json5',
    );
  });

  it('throws when apiToken is not a string', async () => {
    const service = await makeService(
      writeConfig(`{ connection: { apiToken: 42 } }`),
    );
    expect(() => service.getApiToken()).toThrow(
      'connection.apiToken is not set in import-test-config.json5',
    );
  });
});
