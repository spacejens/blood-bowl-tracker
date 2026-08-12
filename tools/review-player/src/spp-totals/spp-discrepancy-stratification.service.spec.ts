import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import type { MockDbResult } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { SppDiscrepancyStratificationService } from './spp-discrepancy-stratification.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<SppDiscrepancyStratificationService> {
  const externalSystems = mock<ExternalSystemLookupService>();
  externalSystems.getSystemId.mockResolvedValue(3);
  const moduleRef = await Test.createTestingModule({
    providers: [
      SppDiscrepancyStratificationService,
      { provide: DB, useValue: dbResult.db },
      { provide: ExternalSystemLookupService, useValue: externalSystems },
    ],
  }).compile();
  return moduleRef.get(SppDiscrepancyStratificationService);
}

describe('SppDiscrepancyStratificationService', () => {
  it('offers one always-on discrepancy stratum for both sources', async () => {
    const service = await makeService(mockDb());

    expect(service.listStrata()).toEqual([
      {
        id: 'spp-discrepancy',
        label: 'SPP totals disagree',
        sources: ['bbl', 'tp'],
      },
    ]);
  });

  it('returns every disagreeing player, tagged with the source', async () => {
    const service = await makeService(
      mockDb([
        {
          playerId: 42,
          externalId: '1000',
          playerName: 'Janhorgh',
          teamName: 'Bockar',
          positionName: 'Lineman',
          eraName: 'Third Era',
        },
      ]),
    );

    expect(
      await service.sampleStratum({
        source: 'bbl',
        stratumId: 'spp-discrepancy',
        limit: 3,
      }),
    ).toEqual([
      {
        source: 'bbl',
        playerId: 42,
        externalId: '1000',
        playerName: 'Janhorgh',
        teamName: 'Bockar',
        positionName: 'Lineman',
        eraName: 'Third Era',
      },
    ]);
  });

  it('ignores the sample limit — a real discrepancy is never sampled away', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      source: 'tp',
      stratumId: 'spp-discrepancy',
      limit: 3,
    });

    expect(dbResult.chains[0].limit).not.toHaveBeenCalled();
  });

  it('rejects an unknown stratum id', async () => {
    const service = await makeService(mockDb());

    await expect(
      service.sampleStratum({ source: 'bbl', stratumId: 'nope', limit: 3 }),
    ).rejects.toThrow(/Unknown player stratum "nope"/);
  });
});
