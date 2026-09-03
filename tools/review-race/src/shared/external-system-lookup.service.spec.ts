import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { RaceReviewConfigService } from '../config/review-race-config.service';
import { ExternalSystemLookupService } from './external-system-lookup.service';

async function makeService(
  rows: unknown[][],
): Promise<{ service: ExternalSystemLookupService; chains: unknown[] }> {
  const dbResult = mockDb(...rows);
  const config = mock<RaceReviewConfigService>();
  config.getExternalSystemName.mockReturnValue('tloeg.bbleague.se');
  const moduleRef = await Test.createTestingModule({
    providers: [
      ExternalSystemLookupService,
      { provide: DB, useValue: dbResult.db },
      { provide: RaceReviewConfigService, useValue: config },
    ],
  }).compile();
  return {
    service: moduleRef.get(ExternalSystemLookupService),
    chains: dbResult.chains,
  };
}

describe('ExternalSystemLookupService', () => {
  it('resolves the configured system name to its id', async () => {
    const { service } = await makeService([[{ id: 3 }]]);

    expect(await service.getSystemId('bbl')).toBe(3);
  });

  it('memoizes the lookup per source', async () => {
    const { service, chains } = await makeService([[{ id: 3 }]]);

    await service.getSystemId('bbl');
    await service.getSystemId('bbl');

    expect(chains).toHaveLength(1);
  });

  it('throws a message naming the config key when the system is absent', async () => {
    const { service } = await makeService([[]]);

    await expect(service.getSystemId('bbl')).rejects.toThrow(
      /review-race-config\.json5/,
    );
  });
});
