import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { SourceConfigService } from './source-config.service';

function makeService(value: string | undefined): SourceConfigService {
  const configService = {
    get: (_key: string) => value,
  } as unknown as ConfigService;
  return new SourceConfigService(configService);
}

describe('SourceConfigService', () => {
  it('resolves a relative BBL_DATA_DIR against the current working directory', () => {
    const service = makeService('data/tloeg.bbleague.se');
    expect(service.getDataDir()).toBe(resolve('data/tloeg.bbleague.se'));
  });

  it('returns an absolute BBL_DATA_DIR unchanged', () => {
    const service = makeService('/srv/bbl/data');
    expect(service.getDataDir()).toBe('/srv/bbl/data');
  });

  it('throws when BBL_DATA_DIR is not set', () => {
    const service = makeService(undefined);
    expect(() => service.getDataDir()).toThrow('BBL_DATA_DIR');
  });
});
