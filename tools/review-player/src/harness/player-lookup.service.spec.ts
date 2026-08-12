import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import type { MockDbResult } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { PlayerLookupService } from './player-lookup.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<PlayerLookupService> {
  const externalSystems = mock<ExternalSystemLookupService>();
  externalSystems.getSystemId.mockResolvedValue(3);
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerLookupService,
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
