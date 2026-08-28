import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ImportTpConfigService } from '../config/import-tp-config.service';
import { ExternalSystemNameConfigService } from './external-system-name-config.service';

describe('ExternalSystemNameConfigService', () => {
  let config: MockProxy<ImportTpConfigService>;
  let service: ExternalSystemNameConfigService;

  beforeEach(async () => {
    config = mock<ImportTpConfigService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExternalSystemNameConfigService,
        { provide: ImportTpConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(ExternalSystemNameConfigService);
  });

  function withName(name: string | undefined): void {
    config.get.mockImplementation((key: string) =>
      key === 'externalSystemName' ? name : undefined,
    );
  }

  it('returns "TP" when externalSystemName is not set', () => {
    withName(undefined);
    expect(service.getTpSystemName()).toBe('TP');
  });

  it('returns the configured value when externalSystemName is set', () => {
    withName('MyTp');
    expect(service.getTpSystemName()).toBe('MyTp');
  });
});
