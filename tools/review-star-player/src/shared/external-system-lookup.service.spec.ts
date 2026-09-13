import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { StarPlayerReviewConfigService } from '../config/review-star-player-config.service';
import { ExternalSystemLookupService } from './external-system-lookup.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<ExternalSystemLookupService> {
  const config = mock<StarPlayerReviewConfigService>();
  config.getExternalSystemName.mockReturnValue('tloeg.bbleague.se');
  const moduleRef = await Test.createTestingModule({
    providers: [
      ExternalSystemLookupService,
      { provide: DB, useValue: dbResult.db },
      { provide: StarPlayerReviewConfigService, useValue: config },
    ],
  }).compile();
  return moduleRef.get(ExternalSystemLookupService);
}

describe('ExternalSystemLookupService', () => {
  it('resolves the configured system name to its id', async () => {
    const service = await makeService(mockDb([{ id: 9 }]));

    expect(await service.getSystemId('bbl')).toBe(9);
  });

  it('memoizes the lookup', async () => {
    const dbResult = mockDb([{ id: 9 }], [{ id: 11 }]);
    const service = await makeService(dbResult);

    await service.getSystemId('bbl');

    expect(await service.getSystemId('bbl')).toBe(9);
  });

  it("names this tool's config file when the system is missing", async () => {
    const service = await makeService(mockDb([]));

    await expect(service.getSystemId('bbl')).rejects.toThrow(
      /review-star-player-config\.json5/,
    );
  });
});
