import { competitions, DB, matches } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/review-harness/test-helpers';
import { mockDb } from '@blood-bowl-tracker/review-harness/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { MatchEventStratificationService } from './match-event-stratification.service';

const dbRow = {
  matchId: 11,
  externalIds: ['1830'],
  matchName: 'Round 3',
  competitionName: 'Season 18',
  playedAt: new Date('2021-09-25T18:00:00.000Z'),
  category: 'normal' as const,
};

const mappedRow = {
  matchId: dbRow.matchId,
  matchName: dbRow.matchName,
  competitionName: dbRow.competitionName,
  playedAt: dbRow.playedAt,
  category: dbRow.category,
  externalId: '1830',
  secondaryExternalId: undefined,
};

async function makeService(
  dbResult: MockDbResult,
): Promise<MatchEventStratificationService> {
  const externalSystems = mock<ExternalSystemLookupService>();
  externalSystems.getSystemId.mockResolvedValue(3);
  const moduleRef = await Test.createTestingModule({
    providers: [
      MatchEventStratificationService,
      { provide: DB, useValue: dbResult.db },
      { provide: ExternalSystemLookupService, useValue: externalSystems },
    ],
  }).compile();
  return moduleRef.get(MatchEventStratificationService);
}

describe('MatchEventStratificationService', () => {
  describe('listStrata', () => {
    it('lists the six strata from the design, in report order', async () => {
      const service = await makeService(mockDb());

      expect(service.listStrata().map((stratum) => stratum.id)).toEqual([
        'foul',
        'casualty',
        'paired',
        'unpaired',
        'unidentified',
        'avoided',
      ]);
    });

    it('offers the BBL-only strata for BBL only', async () => {
      const service = await makeService(mockDb());
      const strata = service.listStrata();

      expect(strata.find((s) => s.id === 'avoided')?.sources).toEqual(['bbl']);
      expect(strata.find((s) => s.id === 'unidentified')?.sources).toEqual([
        'bbl',
      ]);
      expect(strata.find((s) => s.id === 'foul')?.sources).toEqual([
        'bbl',
        'tp',
      ]);
    });

    it('gives every stratum a non-empty label', async () => {
      const service = await makeService(mockDb());

      for (const stratum of service.listStrata()) {
        expect(stratum.label).not.toBe('');
      }
    });
  });

  describe('sampleStratum', () => {
    it('returns the queried rows tagged with the source', async () => {
      const dbResult = mockDb([dbRow]);
      const service = await makeService(dbResult);

      await expect(
        service.sampleStratum({ source: 'bbl', stratumId: 'foul', limit: 3 }),
      ).resolves.toEqual([{ source: 'bbl', ...mappedRow }]);
    });

    it('sets secondaryExternalId from the second aggregated id, for a merged match', async () => {
      const dbResult = mockDb([{ ...dbRow, externalIds: ['1830', '1831'] }]);
      const service = await makeService(dbResult);

      const [result] = await service.sampleStratum({
        source: 'bbl',
        stratumId: 'foul',
        limit: 3,
      });

      expect(result.externalId).toBe('1830');
      expect(result.secondaryExternalId).toBe('1831');
    });

    it('dedups repeated external ids from the matchEvents join fan-out', async () => {
      // For a merged match with several events, joining matchEvents against
      // matchExternalIds repeats each external id once per event row --
      // array_agg (without DISTINCT, since Postgres rejects DISTINCT
      // combined with this ORDER BY) collects all of them, so the service
      // must dedup in JS rather than trusting the aggregate to be unique.
      const dbResult = mockDb([
        { ...dbRow, externalIds: ['1830', '1830', '1831', '1831', '1831'] },
      ]);
      const service = await makeService(dbResult);

      const [result] = await service.sampleStratum({
        source: 'bbl',
        stratumId: 'foul',
        limit: 3,
      });

      expect(result.externalId).toBe('1830');
      expect(result.secondaryExternalId).toBe('1831');
    });

    it('limits the query to the requested number of matches', async () => {
      const dbResult = mockDb([dbRow]);
      const service = await makeService(dbResult);

      await service.sampleStratum({
        source: 'tp',
        stratumId: 'casualty',
        limit: 5,
      });

      expect(dbResult.chains[0].limit).toHaveBeenCalledWith(5);
    });

    it('returns an empty list when no match satisfies the stratum', async () => {
      const service = await makeService(mockDb([]));

      await expect(
        service.sampleStratum({ source: 'tp', stratumId: 'avoided', limit: 3 }),
      ).resolves.toEqual([]);
    });

    it('filters each stratum differently', async () => {
      const dbResult = mockDb([], []);
      const service = await makeService(dbResult);

      await service.sampleStratum({
        source: 'bbl',
        stratumId: 'foul',
        limit: 1,
      });
      await service.sampleStratum({
        source: 'bbl',
        stratumId: 'unidentified',
        limit: 1,
      });

      const [first, second] = dbResult.chains;
      expect(first.where).toHaveBeenCalledTimes(1);
      expect(second.where).toHaveBeenCalledTimes(1);
      expect(first.where.mock.calls[0][0]).not.toEqual(
        second.where.mock.calls[0][0],
      );
    });

    it('queries the unpaired stratum', async () => {
      const dbResult = mockDb([dbRow]);
      const service = await makeService(dbResult);

      await expect(
        service.sampleStratum({
          source: 'bbl',
          stratumId: 'unpaired',
          limit: 2,
        }),
      ).resolves.toEqual([{ source: 'bbl', ...mappedRow }]);
    });

    it('groups by the match, not the external id, so a merged match yields one row', async () => {
      const dbResult = mockDb([dbRow]);
      const service = await makeService(dbResult);

      await service.sampleStratum({
        source: 'bbl',
        stratumId: 'foul',
        limit: 3,
      });

      // A merged BBL match has two matchExternalIds rows for the same
      // match. Grouping by the raw external id column (as this query used
      // to) would split it into two result rows, halving the effective
      // sample size; grouping by the match's own columns and using an
      // aggregate for externalId keeps it to one row.
      expect(dbResult.chains[0].groupBy).toHaveBeenCalledWith(
        matches.id,
        matches.name,
        competitions.name,
        matches.playedAt,
        matches.category,
      );
    });

    it('throws when asked for a stratum it does not offer', async () => {
      const service = await makeService(mockDb());

      await expect(
        service.sampleStratum({
          source: 'bbl',
          stratumId: 'nonsense',
          limit: 1,
        }),
      ).rejects.toThrow(/Unknown match-event stratum "nonsense"/);
    });

    it('scopes the external-id join to the source it was asked for', async () => {
      const externalSystems = mock<ExternalSystemLookupService>();
      externalSystems.getSystemId.mockResolvedValue(9);
      const dbResult = mockDb([]);
      const moduleRef = await Test.createTestingModule({
        providers: [
          MatchEventStratificationService,
          { provide: DB, useValue: dbResult.db },
          { provide: ExternalSystemLookupService, useValue: externalSystems },
        ],
      }).compile();
      const service = moduleRef.get(MatchEventStratificationService);

      await service.sampleStratum({
        source: 'tp',
        stratumId: 'paired',
        limit: 1,
      });

      expect(externalSystems.getSystemId).toHaveBeenCalledWith('tp');
    });
  });
});
