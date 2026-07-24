import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { ImportBblConfigService } from '../config/import-bbl-config.service';
import { ExternalSystemNameConfigService } from './external-system-name-config.service';

describe('ExternalSystemNameConfigService', () => {
  let service: ExternalSystemNameConfigService;
  let config: MockProxy<ImportBblConfigService>;

  beforeEach(async () => {
    config = mock<ImportBblConfigService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExternalSystemNameConfigService,
        { provide: ImportBblConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(ExternalSystemNameConfigService);
  });

  function stub(name: string | undefined): void {
    config.get.mockImplementation((key: string) =>
      key === 'externalSystemName' ? name : undefined,
    );
  }

  it('returns "BBL" when externalSystemName is not set', () => {
    stub(undefined);
    expect(service.getBblSystemName()).toBe('BBL');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(config.get).toHaveBeenCalledWith('externalSystemName');
  });

  it('returns "BBL" when externalSystemName is empty or whitespace', () => {
    stub('');
    expect(service.getBblSystemName()).toBe('BBL');
    stub('   ');
    expect(service.getBblSystemName()).toBe('BBL');
  });

  it('returns the configured value when externalSystemName is set', () => {
    stub('MyLeague');
    expect(service.getBblSystemName()).toBe('MyLeague');
  });
});
