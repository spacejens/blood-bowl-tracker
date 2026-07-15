import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ImportBblConfigService } from './import-bbl-config.service';

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

  it('treats a missing file as an empty config', () => {
    const service = new ImportBblConfigService(
      join(dir, 'does-not-exist.json5'),
    );
    expect(service.get('league')).toBeUndefined();
    expect(service.get('connection')).toBeUndefined();
  });

  it('throws when the file is missing, since connection is not set', () => {
    const service = new ImportBblConfigService(
      join(dir, 'does-not-exist.json5'),
    );
    expect(() => service.getApiBaseUrl()).toThrow(
      'connection is not set in import-bbl-config.json5',
    );
  });

  it('throws when connection is not set', () => {
    const path = writeConfig(`{
      league: { leagueName: 'tLoEG', eras: [] },
    }`);
    const service = new ImportBblConfigService(path);
    expect(() => service.getApiBaseUrl()).toThrow(
      'connection is not set in import-bbl-config.json5',
    );
  });

  it('returns the default API base URL when connection is present but apiBaseUrl is unset', () => {
    const path = writeConfig(`{ connection: {} }`);
    const service = new ImportBblConfigService(path);
    expect(service.getApiBaseUrl()).toBe('http://localhost:3000');
  });

  it('parses JSON5 (comments, trailing commas, unquoted keys) and returns parsed values', () => {
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
    const service = new ImportBblConfigService(path);
    expect(service.get<{ leagueName: string }>('league')?.leagueName).toBe(
      'tLoEG',
    );
    expect(service.get<{ eras: unknown[] }>('league')?.eras).toHaveLength(1);
    expect(service.getApiBaseUrl()).toBe('http://example.test:3000');
  });

  it('throws with the file path when the file is not valid JSON5', () => {
    const path = writeConfig('{ this is : not valid');
    expect(() => new ImportBblConfigService(path)).toThrow(path);
  });
});
