import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ImportManualConfigService } from './import-manual-config.service';

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

  it('treats a missing file as an empty config', () => {
    const service = new ImportManualConfigService(
      join(dir, 'does-not-exist.json5'),
    );
    expect(service.get('connection')).toBeUndefined();
  });

  it('throws when the file is missing, since connection is not set', () => {
    const service = new ImportManualConfigService(
      join(dir, 'does-not-exist.json5'),
    );
    expect(() => service.getApiBaseUrl()).toThrow(
      'connection is not set in import-manual-config.json5',
    );
  });

  it('throws when connection is not set', () => {
    const path = writeConfig(`{ }`);
    const service = new ImportManualConfigService(path);
    expect(() => service.getApiBaseUrl()).toThrow(
      'connection is not set in import-manual-config.json5',
    );
  });

  it('returns the default API base URL when connection is present but apiBaseUrl is unset', () => {
    const path = writeConfig(`{ connection: {} }`);
    const service = new ImportManualConfigService(path);
    expect(service.getApiBaseUrl()).toBe('http://localhost:3000');
  });

  it('parses JSON5 and returns the configured API base URL', () => {
    const path = writeConfig(`{
      // a comment
      connection: { apiBaseUrl: 'http://example.test:3000' },
    }`);
    const service = new ImportManualConfigService(path);
    expect(service.getApiBaseUrl()).toBe('http://example.test:3000');
  });

  it('throws with the file path when the file is not valid JSON5', () => {
    const path = writeConfig('{ this is : not valid');
    expect(() => new ImportManualConfigService(path)).toThrow(path);
  });

  it('throws when the config file cannot be read due to a non-ENOENT error', () => {
    const path = join(dir, 'import-manual-config.json5');
    writeFileSync(path, '{ connection: {} }', 'utf8');
    // Change permissions to make file unreadable
    try {
      const fs = require('node:fs');
      fs.chmodSync(path, 0o000);
      expect(() => new ImportManualConfigService(path)).toThrow();
    } finally {
      // Restore permissions for cleanup
      require('node:fs').chmodSync(path, 0o644);
    }
  });
});
