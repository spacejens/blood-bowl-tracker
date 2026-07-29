import { competitions, DB, matches } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import type { MockDbResult } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { MatchCategoryStratificationService } from './match-category-stratification.service';

const dbRow = {
  matchId: 11,
  externalIds: ['1830'],
  matchName: 'Cup Final',
  competitionName: 'Bierhallentodball 2021',
  playedAt: new Date('2021-09-25T18:00:00.000Z'),
};

async function makeService(
  dbResult: MockDbResult,
  systemId = 3,
): Promise<MatchCategoryStratificationService> {
  const externalSystems = mock<ExternalSystemLookupService>();
  externalSystems.getSystemId.mockResolvedValue(systemId);
  const moduleRef = await Test.createTestingModule({
    providers: [
      MatchCategoryStratificationService,
      { provide: DB, useValue: dbResult.db },
      { provide: ExternalSystemLookupService, useValue: externalSystems },
    ],
  }).compile();
  return moduleRef.get(MatchCategoryStratificationService);
}

describe('MatchCategoryStratificationService', () => {
  describe('listStrata', () => {
    it('lists the five non-normal category strata, in table order', async () => {
      const service = await makeService(mockDb());

      expect(service.listStrata().map((stratum) => stratum.id)).toEqual([
        'cup_final',
        'season_semi_final',
        'season_final',
        'season_bronze',
        'season_qualifier',
      ]);
    });

    it('offers every stratum for both BBL and TP', async () => {
      const service = await makeService(mockDb());

      for (const stratum of service.listStrata()) {
        expect(stratum.sources).toEqual(['bbl', 'tp']);
      }
    });

    it('gives every stratum a non-empty label', async () => {
      const service = await makeService(mockDb());

      for (const stratum of service.listStrata()) {
        expect(stratum.label).not.toBe('');
      }
    });
  });

  describe('sampleStratum', () => {
    it.each([
      ['cup_final', 'cup_final'],
      ['season_semi_final', 'season_semi_final'],
      ['season_final', 'season_final'],
      ['season_bronze', 'season_bronze'],
      ['season_qualifier', 'season_qualifier'],
    ] as const)(
      'filters stratum "%s" on matches.category = "%s"',
      async (stratumId, category) => {
        const dbResult = mockDb([dbRow]);
        const service = await makeService(dbResult);

        await expect(
          service.sampleStratum({ source: 'bbl', stratumId, limit: 3 }),
        ).resolves.toEqual([
          {
            source: 'bbl',
            category,
            matchId: dbRow.matchId,
            matchName: dbRow.matchName,
            competitionName: dbRow.competitionName,
            playedAt: dbRow.playedAt,
            externalId: '1830',
            secondaryExternalId: undefined,
          },
        ]);

        expect(dbResult.chains[0].where).toHaveBeenCalledWith(
          eq(matches.category, category),
        );
      },
    );

    it('sets secondaryExternalId from the second aggregated id, for a merged match', async () => {
      const dbResult = mockDb([{ ...dbRow, externalIds: ['1830', '1831'] }]);
      const service = await makeService(dbResult);

      const [result] = await service.sampleStratum({
        source: 'bbl',
        stratumId: 'cup_final',
        limit: 3,
      });

      expect(result.externalId).toBe('1830');
      expect(result.secondaryExternalId).toBe('1831');
    });

    it('groups by the match, not the external id, so a merged match yields one row', async () => {
      const dbResult = mockDb([dbRow]);
      const service = await makeService(dbResult);

      await service.sampleStratum({
        source: 'bbl',
        stratumId: 'cup_final',
        limit: 3,
      });

      // A merged BBL match (the four-team finals) has two matchExternalIds
      // rows for the same match under the same external system — exactly
      // the case a cup_final/season_final stratum is likely to hit.
      // Grouping by the match's own columns (and picking the lowest external
      // id via an aggregate, asserted by the query shape itself) keeps it to
      // one row, the same guard MatchEventStratificationService and
      // MergedMatchStratificationService both apply.
      expect(dbResult.chains[0].groupBy).toHaveBeenCalledWith(
        matches.id,
        matches.name,
        competitions.name,
        matches.playedAt,
        matches.category,
      );
    });

    it('limits the query to the requested number of matches', async () => {
      const dbResult = mockDb([dbRow]);
      const service = await makeService(dbResult);

      await service.sampleStratum({
        source: 'bbl',
        stratumId: 'cup_final',
        limit: 5,
      });

      expect(dbResult.chains[0].limit).toHaveBeenCalledWith(5);
    });

    it('returns an empty list when no match satisfies the stratum', async () => {
      const service = await makeService(mockDb([]));

      await expect(
        service.sampleStratum({
          source: 'tp',
          stratumId: 'season_final',
          limit: 3,
        }),
      ).resolves.toEqual([]);
    });

    it('scopes the external-id join to the source it was asked for', async () => {
      const externalSystems = mock<ExternalSystemLookupService>();
      externalSystems.getSystemId.mockResolvedValue(9);
      const dbResult = mockDb([]);
      const moduleRef = await Test.createTestingModule({
        providers: [
          MatchCategoryStratificationService,
          { provide: DB, useValue: dbResult.db },
          { provide: ExternalSystemLookupService, useValue: externalSystems },
        ],
      }).compile();
      const service = moduleRef.get(MatchCategoryStratificationService);

      await service.sampleStratum({
        source: 'tp',
        stratumId: 'cup_final',
        limit: 1,
      });

      expect(externalSystems.getSystemId).toHaveBeenCalledWith('tp');
    });

    it('throws when asked for a stratum it does not offer', async () => {
      const service = await makeService(mockDb());

      await expect(
        service.sampleStratum({
          source: 'bbl',
          stratumId: 'nonsense',
          limit: 1,
        }),
      ).rejects.toThrow(/Unknown match-category stratum "nonsense"/);
    });
  });
});
