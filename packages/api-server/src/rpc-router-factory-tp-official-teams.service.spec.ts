import { call } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { createRouterHarness } from './rpc-router-factory.test-helpers';

describe('RpcRouterFactoryService tpOfficialTeams router', () => {
  let harness: Awaited<ReturnType<typeof createRouterHarness>>;

  beforeEach(async () => {
    harness = await createRouterHarness();
  });

  it('imports one rules set through TpOfficialTeamsImportService', async () => {
    const one = { success: true, imported: 1, errors: [] };
    const outcome = {
      races: one,
      positions: one,
      characteristics: one,
      keywords: one,
      startingSkills: one,
      positionCharacteristics: [
        {
          positionId: 9,
          rulesSetId: 20,
          move: 5,
          strength: 3,
          agility: 3,
          passing: 4,
          armour: 9,
        },
      ],
    };
    harness.mocks.tpOfficialTeamsImportService.importOfficialTeams.mockResolvedValue(
      outcome,
    );
    const races = [
      {
        name: 'Orc',
        teamRaceCode: 'orc25',
        isOfficial: true,
        positions: [
          {
            name: 'Blitzer',
            isStarPlayer: false,
            tpPositionId: 77,
            characteristics: {
              move: 5,
              strength: 3,
              agility: 3,
              passing: 4,
              armour: 9,
            },
            skills: [{ skillMasterId: 41 }, { name: 'Brutal Charge' }],
            keywordCodes: [4],
          },
        ],
      },
    ];

    const result = await call(harness.router.tpOfficialTeams.import, {
      rulesSet: 'BB2025',
      races,
      externalSystemName: 'TP',
    });

    expect(result).toEqual(outcome);
    expect(
      harness.mocks.tpOfficialTeamsImportService.importOfficialTeams,
    ).toHaveBeenCalledWith({
      rulesSet: 'BB2025',
      races,
      skillMasters: [],
      externalSystemName: 'TP',
    });
  });
});
