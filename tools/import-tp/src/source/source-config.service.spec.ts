import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ImportTpConfigService } from '../config/import-tp-config.service';
import { SourceConfigService } from './source-config.service';

function makeService(dataDir: unknown): SourceConfigService {
  const config = {
    get: (key: string) => (key === 'dataDir' ? dataDir : undefined),
  } as unknown as ImportTpConfigService;
  return new SourceConfigService(config);
}

describe('SourceConfigService', () => {
  it('resolves a relative dataDir against the current working directory', () => {
    expect(makeService('data').getDataDir()).toBe(resolve('data'));
  });

  it('returns an absolute dataDir unchanged', () => {
    expect(makeService('/abs/data').getDataDir()).toBe('/abs/data');
  });

  it('throws when dataDir is not set', () => {
    expect(() => makeService(undefined).getDataDir()).toThrow(
      'dataDir is not set in import-tp-config.json5',
    );
  });
});
