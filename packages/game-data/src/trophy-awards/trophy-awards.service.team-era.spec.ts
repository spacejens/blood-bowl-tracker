import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  extractFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import {
  TrophyAwardRecipientMismatchError,
  TrophyAwardsService,
} from './trophy-awards.service';

const playerTrophyRow = [
  { recipientKind: 'player', competitionGroupId: 1, leagueId: null },
];
const matchingCompetitionRow = [{ competitionGroupId: 1 }];
const awardRow = {
  id: 10,
  trophyId: 1,
  competitionId: 2,
  teamEraId: 3,
  playerId: 4,
  createdAt: new Date('2026-01-01'),
};

/**
 * Query slots, in the order `upsert` issues them: the trophy lookup, the
 * competition lookup, then — only when the caller omitted `teamEraId` — the
 * player's own row, and finally the insert.
 */
async function build(...rowsPerQuery: unknown[][]): Promise<{
  service: TrophyAwardsService;
  chains: QueryChain[];
}> {
  const { db, chains } = mockDb(...rowsPerQuery);
  const moduleRef = await Test.createTestingModule({
    providers: [TrophyAwardsService, { provide: DB, useValue: db }],
  }).compile();
  return { service: moduleRef.get(TrophyAwardsService), chains };
}

describe('TrophyAwardsService.upsert team era derivation', () => {
  it("derives a player award's team era from the player's own row", async () => {
    const { service, chains } = await build(
      playerTrophyRow,
      matchingCompetitionRow,
      [{ teamEraId: 3 }],
      [awardRow],
    );

    const result = await service.upsert({
      trophyId: 1,
      competitionId: 2,
      playerId: 4,
    });

    expect(result).toEqual({ trophyAward: awardRow, created: true });
    // The third query is the player lookup, filtered on the award's player.
    expect(extractFilterValues(firstCallArg(chains[2].where))).toBe(4);
    expect(chains[3].values).toHaveBeenCalledWith({
      trophyId: 1,
      competitionId: 2,
      teamEraId: 3,
      playerId: 4,
    });
  });

  it('uses an explicitly supplied team era without looking the player up', async () => {
    const { service, chains } = await build(
      playerTrophyRow,
      matchingCompetitionRow,
      [{ ...awardRow, teamEraId: 9 }],
    );

    await service.upsert({
      trophyId: 1,
      competitionId: 2,
      teamEraId: 9,
      playerId: 4,
    });

    // Three queries only: trophy, competition, insert — no player lookup.
    expect(chains).toHaveLength(3);
    expect(chains[2].values).toHaveBeenCalledWith({
      trophyId: 1,
      competitionId: 2,
      teamEraId: 9,
      playerId: 4,
    });
  });

  it('rejects a player award whose player does not exist', async () => {
    const { service } = await build(
      playerTrophyRow,
      matchingCompetitionRow,
      [],
    );

    await expect(
      service.upsert({ trophyId: 1, competitionId: 2, playerId: 404 }),
    ).rejects.toBeInstanceOf(TrophyAwardRecipientMismatchError);
  });

  /**
   * `UpsertTrophyAwardSchema`'s own refinement is what rejects this over the
   * API, before the service is ever reached. The guard asserted here is the
   * in-process backstop for a direct game-data caller, and it is deliberately
   * a plain Error rather than one of the two BAD_REQUEST-mapped domain
   * errors: reaching it means a caller bypassed the contract schema, which is
   * a bug in that caller, not authored-data feedback.
   */
  it('rejects a team award that states no team era', async () => {
    const { service } = await build(
      [{ recipientKind: 'team', competitionGroupId: 1, leagueId: null }],
      matchingCompetitionRow,
    );

    await expect(
      service.upsert({ trophyId: 1, competitionId: 2, playerId: null }),
    ).rejects.toThrow(/team era/);
  });
});
