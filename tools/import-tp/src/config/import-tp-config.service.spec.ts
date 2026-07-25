import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  IMPORT_TP_CONFIG_PATH,
  ImportTpConfigService,
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
});
