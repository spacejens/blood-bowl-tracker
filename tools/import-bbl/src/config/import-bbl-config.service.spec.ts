import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  IMPORT_BBL_CONFIG_PATH,
  ImportBblConfigService,
} from './import-bbl-config.service';

describe('ImportBblConfigService', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'import-bbl-config-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeConfig(contents: string): string {
    const path = join(dir, 'import-bbl-config.json5');
    writeFileSync(path, contents, 'utf8');
    return path;
  }

  async function makeService(
    filePath: string,
  ): Promise<ImportBblConfigService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImportBblConfigService,
        { provide: IMPORT_BBL_CONFIG_PATH, useValue: filePath },
      ],
    }).compile();
    return moduleRef.get(ImportBblConfigService);
  }

  it('treats a missing file as an empty config', async () => {
    const service = await makeService(join(dir, 'does-not-exist.json5'));
    expect(service.get('league')).toBeUndefined();
    expect(service.get('connection')).toBeUndefined();
  });

  it('throws when the file is missing, since connection is not set', async () => {
    const service = await makeService(join(dir, 'does-not-exist.json5'));
    expect(() => service.getApiBaseUrl()).toThrow(
      'connection is not set in import-bbl-config.json5',
    );
  });

  it('throws when connection is not set', async () => {
    const path = writeConfig(`{
      league: { leagueName: 'tLoEG', eras: [] },
    }`);
    const service = await makeService(path);
    expect(() => service.getApiBaseUrl()).toThrow(
      'connection is not set in import-bbl-config.json5',
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
      league: {
        leagueName: 'tLoEG',
        eras: [
          { identity: { name: 'First era', rulesSets: ['CRP'] } },
        ],
      },
    }`);
    const service = await makeService(path);
    expect(service.get<{ leagueName: string }>('league')?.leagueName).toBe(
      'tLoEG',
    );
    expect(service.get<{ eras: unknown[] }>('league')?.eras).toHaveLength(1);
    expect(service.getApiBaseUrl()).toBe('http://example.test:3000');
  });

  it('throws with the file path when the file is not valid JSON5', async () => {
    const path = writeConfig('{ this is : not valid');
    await expect(
      Test.createTestingModule({
        providers: [
          ImportBblConfigService,
          { provide: IMPORT_BBL_CONFIG_PATH, useValue: path },
        ],
      }).compile(),
    ).rejects.toThrow(path);
  });

  it('returns the configured API token', async () => {
    const path = writeConfig(`{ connection: { apiToken: 'bbl-secret' } }`);
    const service = await makeService(path);
    expect(service.getApiToken()).toBe('bbl-secret');
  });

  it('throws from getApiToken when connection is not set', async () => {
    const path = writeConfig(`{ league: { leagueName: 'tLoEG', eras: [] } }`);
    const service = await makeService(path);
    expect(() => service.getApiToken()).toThrow(
      'connection is not set in import-bbl-config.json5',
    );
  });

  it('throws when apiToken is missing', async () => {
    const path = writeConfig(`{ connection: { apiBaseUrl: 'http://x:3000' } }`);
    const service = await makeService(path);
    expect(() => service.getApiToken()).toThrow(
      'connection.apiToken is not set in import-bbl-config.json5',
    );
  });

  it('throws when apiToken is an empty string', async () => {
    const path = writeConfig(`{ connection: { apiToken: '' } }`);
    const service = await makeService(path);
    expect(() => service.getApiToken()).toThrow(
      'connection.apiToken is not set in import-bbl-config.json5',
    );
  });

  it('throws when apiToken is not a string', async () => {
    const path = writeConfig(`{ connection: { apiToken: 42 } }`);
    const service = await makeService(path);
    expect(() => service.getApiToken()).toThrow(
      'connection.apiToken is not set in import-bbl-config.json5',
    );
  });
});
