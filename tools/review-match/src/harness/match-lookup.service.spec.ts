import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/review-harness/test-helpers';
import { mockDb } from '@blood-bowl-tracker/review-harness/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { MatchLookupService } from './match-lookup.service';

const dbRow = {
  matchId: 11,
  matchName: 'Round 3',
  competitionName: 'Season 18',
  playedAt: new Date('2021-09-25T18:00:00.000Z'),
  category: 'normal' as const,
  externalIds: ['1830'],
};

async function makeService(
  dbResult: MockDbResult,
): Promise<MatchLookupService> {
  const externalSystems = mock<ExternalSystemLookupService>();
  externalSystems.getSystemId.mockResolvedValue(3);
  const moduleRef = await Test.createTestingModule({
    providers: [
      MatchLookupService,
      { provide: DB, useValue: dbResult.db },
      { provide: ExternalSystemLookupService, useValue: externalSystems },
    ],
  }).compile();
  return moduleRef.get(MatchLookupService);
}

describe('MatchLookupService', () => {
  it('returns the matches found for the given external ids', async () => {
    const service = await makeService(mockDb([{ matchId: 11 }], [dbRow]));

    await expect(service.findByExternalIds('bbl', ['1830'])).resolves.toEqual([
      {
        source: 'bbl',
        matchId: 11,
        externalId: '1830',
        matchName: 'Round 3',
        competitionName: 'Season 18',
        playedAt: new Date('2021-09-25T18:00:00.000Z'),
        category: 'normal',
      },
    ]);
  });

  it('returns an empty list without querying when there are no ids', async () => {
    const dbResult = mockDb([dbRow]);
    const service = await makeService(dbResult);

    await expect(service.findByExternalIds('tp', [])).resolves.toEqual([]);
    expect(dbResult.chains).toHaveLength(0);
  });

  it('returns an empty list when none of the ids exist', async () => {
    const service = await makeService(mockDb([]));

    await expect(service.findByExternalIds('tp', ['nope'])).resolves.toEqual(
      [],
    );
  });

  it("backfills secondaryExternalId from the matched match's other external id when only one was requested", async () => {
    // A merged BBL match reached via a single overrides.bbl id (e.g. '1311')
    // must still resolve both source pages' ids, exactly as a stratifier
    // would, so the raw-source panel can render both.
    const dbResult = mockDb(
      [{ matchId: 11 }],
      [
        {
          matchId: 11,
          matchName: 'Bierhallentodball',
          competitionName: 'Ogretoberfest 6',
          playedAt: new Date('2021-09-25T18:00:00.000Z'),
          category: 'cup_final' as const,
          externalIds: ['1311', '1312'],
        },
      ],
    );
    const service = await makeService(dbResult);

    await expect(service.findByExternalIds('bbl', ['1311'])).resolves.toEqual([
      {
        source: 'bbl',
        matchId: 11,
        externalId: '1311',
        secondaryExternalId: '1312',
        matchName: 'Bierhallentodball',
        competitionName: 'Ogretoberfest 6',
        playedAt: new Date('2021-09-25T18:00:00.000Z'),
        category: 'cup_final',
      },
    ]);
  });
});
