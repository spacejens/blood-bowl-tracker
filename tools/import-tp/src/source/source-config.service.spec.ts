import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { ImportTpConfigService } from '../config/import-tp-config.service';
import { SourceConfigService } from './source-config.service';

describe('SourceConfigService', () => {
  let service: SourceConfigService;
  let config: MockProxy<ImportTpConfigService>;

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

  function stub(dataDir: string | undefined): void {
    config.get.mockImplementation((key: string) =>
      key === 'dataDir' ? dataDir : undefined,
    );
  }

  it('returns the configured dataDir', () => {
    stub('/srv/tp/data');
    expect(service.getDataDir()).toBe('/srv/tp/data');
    expect(config.get).toHaveBeenCalledWith('dataDir');
  });

  it('throws a TP-specific message when dataDir is not set', () => {
    stub(undefined);
    expect(() => service.getDataDir()).toThrow(
      'dataDir is not set in import-tp-config.json5. Set it to the folder ' +
        'containing one subdirectory per era (e.g. data/).',
    );
  });
});
