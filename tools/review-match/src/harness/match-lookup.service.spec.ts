import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import type { MockDbResult } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { MatchLookupService } from './match-lookup.service';

const dbRow = {
  matchId: 11,
  externalId: '1830',
  matchName: 'Round 3',
  competitionName: 'Season 18',
  playedAt: new Date('2021-09-25T18:00:00.000Z'),
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
    const service = await makeService(mockDb([dbRow]));

    await expect(service.findByExternalIds('bbl', ['1830'])).resolves.toEqual([
      { source: 'bbl', ...dbRow },
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
});
