import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/review-harness/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { PlayerProjectionQueryService } from './player-projection-query.service';

describe('PlayerProjectionQueryService', () => {
  it('builds the six-column projection joined across external ids, team, era and position', async () => {
    const dbResult = mockDb([
      {
        playerId: 42,
        externalId: '1000',
        playerName: 'Janhorgh',
        teamName: 'Bockar',
        positionName: 'Lineman',
        eraName: 'Third Era',
      },
    ]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerProjectionQueryService,
        { provide: DB, useValue: dbResult.db },
      ],
    }).compile();
    const service = moduleRef.get(PlayerProjectionQueryService);

    const rows = await service.base(3);

    expect(dbResult.chains).toHaveLength(1);
    expect(dbResult.chains[0].innerJoin).toHaveBeenCalledTimes(5);
    expect(rows).toEqual([
      {
        playerId: 42,
        externalId: '1000',
        playerName: 'Janhorgh',
        teamName: 'Bockar',
        positionName: 'Lineman',
        eraName: 'Third Era',
      },
    ]);
  });
});
