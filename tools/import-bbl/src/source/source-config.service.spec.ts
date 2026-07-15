import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ImportBblConfigService } from '../config/import-bbl-config.service';
import { SourceConfigService } from './source-config.service';

function makeService(dataDir: string | undefined): SourceConfigService {
  const config = {
    get: (_key: string) => dataDir,
  } as unknown as ImportBblConfigService;
  return new SourceConfigService(config);
}

describe('SourceConfigService', () => {
  it('resolves a relative dataDir against the current working directory', () => {
    const service = makeService('data/tloeg.bbleague.se');
    expect(service.getDataDir()).toBe(resolve('data/tloeg.bbleague.se'));
  });

  it('returns an absolute dataDir unchanged', () => {
    const service = makeService('/srv/bbl/data');
    expect(service.getDataDir()).toBe('/srv/bbl/data');
  });

  it('throws when dataDir is not set', () => {
    const service = makeService(undefined);
    expect(() => service.getDataDir()).toThrow(
      'dataDir is not set in import-bbl-config.json5',
    );
  });
});
