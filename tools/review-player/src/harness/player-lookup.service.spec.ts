import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import { PlayerLookupService } from './player-lookup.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<PlayerLookupService> {
  const externalSystems = mock<ExternalSystemLookupService>();
  externalSystems.getSystemId.mockResolvedValue(3);
  // PlayerProjectionQueryService injects DB and issues a real query, so it
  // doesn't qualify for this repo's real-provider exemptions (module
  // composition specs, or a pure dependency-free formatter) — mock it and
  // hand back a chain sourced from the same mockDb helper used below, so the
  // `dbResult.chains` assertions still see exactly what this service issued.
  const query = mock<PlayerProjectionQueryService>();
  query.base.mockImplementation(() => dbResult.db.select() as never);
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerLookupService,
      { provide: PlayerProjectionQueryService, useValue: query },
      { provide: DB, useValue: dbResult.db },
      { provide: ExternalSystemLookupService, useValue: externalSystems },
    ],
  }).compile();
  return moduleRef.get(PlayerLookupService);
}

describe('PlayerLookupService', () => {
  it('resolves external ids to review players', async () => {
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

    expect(await service.findByExternalIds('bbl', ['1000'])).toEqual([
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

  it('issues no query for an empty id list', async () => {
    const dbResult = mockDb();
    const service = await makeService(dbResult);

    expect(await service.findByExternalIds('tp', [])).toEqual([]);
    expect(dbResult.chains).toHaveLength(0);
  });
});
