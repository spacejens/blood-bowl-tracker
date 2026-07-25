import { resolve } from 'node:path';

import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ImportTpConfigService } from '../config/import-tp-config.service';
import { SourceConfigService } from './source-config.service';

describe('SourceConfigService', () => {
  let config: MockProxy<ImportTpConfigService>;
  let service: SourceConfigService;

  beforeEach(async () => {
    config = mock<ImportTpConfigService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SourceConfigService,
        { provide: ImportTpConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(SourceConfigService);
  });

  function withDataDir(dataDir: unknown): void {
    config.get.mockImplementation((key: string) =>
      key === 'dataDir' ? dataDir : undefined,
    );
  }

  it('resolves a relative dataDir against the current working directory', () => {
    withDataDir('data');
    expect(service.getDataDir()).toBe(resolve('data'));
  });

  it('returns an absolute dataDir unchanged', () => {
    withDataDir('/abs/data');
    expect(service.getDataDir()).toBe('/abs/data');
  });

  it('throws when dataDir is not set', () => {
    withDataDir(undefined);
    expect(() => service.getDataDir()).toThrow(
      'dataDir is not set in import-tp-config.json5',
    );
  });
});
