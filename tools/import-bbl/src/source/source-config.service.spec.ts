import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { ImportBblConfigService } from '../config/import-bbl-config.service';
import { SourceConfigService } from './source-config.service';

describe('SourceConfigService', () => {
  let service: SourceConfigService;
  let config: MockProxy<ImportBblConfigService>;

  beforeEach(async () => {
    config = mock<ImportBblConfigService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SourceConfigService,
        { provide: ImportBblConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(SourceConfigService);
  });

  function stub(dataDir: string | undefined): void {
    config.get.mockImplementation((key: string) =>
      key === 'dataDir' ? dataDir : undefined,
    );
  }

  it('returns the configured dataDir', () => {
    stub('/srv/bbl/data');
    expect(service.getDataDir()).toBe('/srv/bbl/data');
    expect(config.get).toHaveBeenCalledWith('dataDir');
  });

  it('throws a BBL-specific message when dataDir is not set', () => {
    stub(undefined);
    expect(() => service.getDataDir()).toThrow(
      'dataDir is not set in import-bbl-config.json5. Set it to the folder ' +
        'containing the BBL default.asp files (e.g. data/tloeg.bbleague.se/).',
    );
  });
});
