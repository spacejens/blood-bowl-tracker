import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { MatchResultLookupService } from './match-result-lookup.service';

async function makeService(
  db: ReturnType<typeof mockDb>['db'],
): Promise<MatchResultLookupService> {
  const moduleRef = await Test.createTestingModule({
    providers: [MatchResultLookupService, { provide: DB, useValue: db }],
  }).compile();
  return moduleRef.get(MatchResultLookupService);
}

describe('MatchResultLookupService', () => {
  it("groups each match's teams and carries its winner", async () => {
    const { db } = mockDb([
      {
        matchId: 1,
        matchTeamId: 11,
        teamName: 'Sewerton Scavengers',
        score: 2,
        winningMatchTeamId: 11,
      },
      {
        matchId: 1,
        matchTeamId: 12,
        teamName: 'Vorgash New Order',
        score: 1,
        winningMatchTeamId: 11,
      },
    ]);
    const service = await makeService(db);

    const result = await service.findByMatchIds([1]);

    expect(result.get(1)).toEqual({
      teams: [
        { matchTeamId: 11, teamName: 'Sewerton Scavengers', score: 2 },
        { matchTeamId: 12, teamName: 'Vorgash New Order', score: 1 },
      ],
      winningMatchTeamId: 11,
    });
  });

  it('keeps a null winner as a draw', async () => {
    const { db } = mockDb([
      {
        matchId: 2,
        matchTeamId: 21,
        teamName: 'Sewerton Scavengers',
        score: 1,
        winningMatchTeamId: null,
      },
      {
        matchId: 2,
        matchTeamId: 22,
        teamName: 'Vorgash New Order',
        score: 1,
        winningMatchTeamId: null,
      },
    ]);
    const service = await makeService(db);

    const result = await service.findByMatchIds([2]);

    expect(result.get(2)).toEqual({
      teams: [
        { matchTeamId: 21, teamName: 'Sewerton Scavengers', score: 1 },
        { matchTeamId: 22, teamName: 'Vorgash New Order', score: 1 },
      ],
      winningMatchTeamId: null,
    });
  });

  it('returns an empty map for no match ids without querying', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult.db);

    await expect(service.findByMatchIds([])).resolves.toEqual(new Map());
    expect(dbResult.chains).toHaveLength(0);
  });
});
