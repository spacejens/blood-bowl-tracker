import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/review-harness/test-helpers';
import { mockDb } from '@blood-bowl-tracker/review-harness/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ReviewPlayerConfigService } from '../config/review-player-config.service';
import { ExternalSystemLookupService } from './external-system-lookup.service';

async function makeService(dbResult: MockDbResult): Promise<{
  service: ExternalSystemLookupService;
  config: MockProxy<ReviewPlayerConfigService>;
}> {
  const config = mock<ReviewPlayerConfigService>();
  config.getExternalSystemName.mockReturnValue('BBL');
  const moduleRef = await Test.createTestingModule({
    providers: [
      ExternalSystemLookupService,
      { provide: DB, useValue: dbResult.db },
      { provide: ReviewPlayerConfigService, useValue: config },
    ],
  }).compile();
  return { service: moduleRef.get(ExternalSystemLookupService), config };
}

describe('ExternalSystemLookupService', () => {
  it('resolves the configured system name to its id', async () => {
    const { service } = await makeService(mockDb([{ id: 3 }]));

    expect(await service.getSystemId('bbl')).toBe(3);
  });

  it('queries once and memoizes per source', async () => {
    const dbResult = mockDb([{ id: 3 }], [{ id: 3 }]);
    const { service } = await makeService(dbResult);

    await service.getSystemId('bbl');
    await service.getSystemId('bbl');

    expect(dbResult.chains).toHaveLength(1);
  });

  it('memoizes bbl and tp separately, without one leaking into the other', async () => {
    const dbResult = mockDb([{ id: 3 }], [{ id: 7 }]);
    const { service, config } = await makeService(dbResult);
    config.getExternalSystemName.mockImplementation((source) =>
      source === 'bbl' ? 'BBL' : 'TP',
    );

    await service.getSystemId('bbl');
    await service.getSystemId('tp');
    await service.getSystemId('bbl');
    await service.getSystemId('tp');

    expect(dbResult.chains).toHaveLength(2);
    expect(await service.getSystemId('bbl')).toBe(3);
    expect(await service.getSystemId('tp')).toBe(7);
  });

  it('throws a helpful error when the system is not in the database', async () => {
    const { service } = await makeService(mockDb([]));

    await expect(service.getSystemId('bbl')).rejects.toThrow(
      /No external system named "BBL" exists/,
    );
  });
});
