import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import type { MockDbResult } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { MergedMatchStratificationService } from './merged-match-stratification.service';

const dbRow = {
  matchId: 11,
  matchName: 'Final',
  competitionName: 'Bierhallentodball 2021',
  playedAt: new Date('2021-09-25T18:00:00.000Z'),
  externalIds: ['1830', '1831'],
};

async function makeService(
  dbResult: MockDbResult,
  systemId = 3,
): Promise<MergedMatchStratificationService> {
  const externalSystems = mock<ExternalSystemLookupService>();
  externalSystems.getSystemId.mockResolvedValue(systemId);
  const moduleRef = await Test.createTestingModule({
    providers: [
      MergedMatchStratificationService,
      { provide: DB, useValue: dbResult.db },
      { provide: ExternalSystemLookupService, useValue: externalSystems },
    ],
  }).compile();
  return moduleRef.get(MergedMatchStratificationService);
}

describe('MergedMatchStratificationService', () => {
  describe('listStrata', () => {
    it('offers exactly the merged stratum', async () => {
      const service = await makeService(mockDb());

      expect(service.listStrata().map((stratum) => stratum.id)).toEqual([
        'merged',
      ]);
    });

    it('offers the merged stratum for BBL only', async () => {
      const service = await makeService(mockDb());

      expect(service.listStrata()[0].sources).toEqual(['bbl']);
    });

    it('gives the stratum a non-empty label', async () => {
      const service = await makeService(mockDb());

      expect(service.listStrata()[0].label).not.toBe('');
    });
  });

  describe('sampleStratum', () => {
    it('splits the two aggregated ids into primary and secondary', async () => {
      const service = await makeService(mockDb([dbRow]));

      await expect(
        service.sampleStratum({ source: 'bbl', stratumId: 'merged', limit: 3 }),
      ).resolves.toEqual([
        {
          source: 'bbl',
          matchId: 11,
          matchName: 'Final',
          competitionName: 'Bierhallentodball 2021',
          playedAt: new Date('2021-09-25T18:00:00.000Z'),
          externalId: '1830',
          secondaryExternalId: '1831',
        },
      ]);
    });

    it('restricts the query to matches with exactly two external ids', async () => {
      const dbResult = mockDb([dbRow]);
      const service = await makeService(dbResult);

      await service.sampleStratum({
        source: 'bbl',
        stratumId: 'merged',
        limit: 3,
      });

      // The one-id and three-or-more-id matches are excluded in SQL by the
      // HAVING clause; the mock cannot evaluate it, so assert it is applied.
      expect(dbResult.chains[0].groupBy).toHaveBeenCalledTimes(1);
      expect(dbResult.chains[0].having).toHaveBeenCalledTimes(1);
    });

    it('limits the query to the requested number of matches', async () => {
      const dbResult = mockDb([dbRow]);
      const service = await makeService(dbResult);

      await service.sampleStratum({
        source: 'bbl',
        stratumId: 'merged',
        limit: 5,
      });

      expect(dbResult.chains[0].limit).toHaveBeenCalledWith(5);
    });

    it('returns an empty list when no merged match exists', async () => {
      const service = await makeService(mockDb([]));

      await expect(
        service.sampleStratum({ source: 'bbl', stratumId: 'merged', limit: 3 }),
      ).resolves.toEqual([]);
    });

    it('scopes the external-id join to the source it was asked for', async () => {
      const externalSystems = mock<ExternalSystemLookupService>();
      externalSystems.getSystemId.mockResolvedValue(9);
      const dbResult = mockDb([]);
      const moduleRef = await Test.createTestingModule({
        providers: [
          MergedMatchStratificationService,
          { provide: DB, useValue: dbResult.db },
          { provide: ExternalSystemLookupService, useValue: externalSystems },
        ],
      }).compile();
      const service = moduleRef.get(MergedMatchStratificationService);

      await service.sampleStratum({
        source: 'bbl',
        stratumId: 'merged',
        limit: 1,
      });

      expect(externalSystems.getSystemId).toHaveBeenCalledWith('bbl');
    });

    it('throws when asked for a stratum it does not offer', async () => {
      const service = await makeService(mockDb());

      await expect(
        service.sampleStratum({
          source: 'bbl',
          stratumId: 'nonsense',
          limit: 1,
        }),
      ).rejects.toThrow(/Unknown merged-match stratum "nonsense"/);
    });
  });
});
