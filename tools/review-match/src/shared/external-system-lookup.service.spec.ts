import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { ReviewMatchConfigService } from '../config/review-match-config.service';
import type { MockDbResult } from './db-mock.test-helpers';
import { mockDb } from './db-mock.test-helpers';
import { ExternalSystemLookupService } from './external-system-lookup.service';

async function makeService(
  dbResult: MockDbResult,
  externalSystemName = 'BBL',
): Promise<ExternalSystemLookupService> {
  const config = mock<ReviewMatchConfigService>();
  config.getExternalSystemName.mockReturnValue(externalSystemName);
  const moduleRef = await Test.createTestingModule({
    providers: [
      ExternalSystemLookupService,
      { provide: DB, useValue: dbResult.db },
      { provide: ReviewMatchConfigService, useValue: config },
    ],
  }).compile();
  return moduleRef.get(ExternalSystemLookupService);
}

describe('ExternalSystemLookupService', () => {
  it('returns the id of the external system named for the source', async () => {
    const dbResult = mockDb([{ id: 7 }]);
    const service = await makeService(dbResult, 'BBL');

    await expect(service.getSystemId('bbl')).resolves.toBe(7);
  });

  it('queries the database only once per source', async () => {
    const dbResult = mockDb([{ id: 7 }]);
    const service = await makeService(dbResult);

    await service.getSystemId('bbl');
    await service.getSystemId('bbl');

    expect(dbResult.chains).toHaveLength(1);
  });

  it('throws a helpful error when no such external system exists', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult, 'Nope');

    await expect(service.getSystemId('tp')).rejects.toThrow(
      /No external system named "Nope" exists in the database/,
    );
  });
});
