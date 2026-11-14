import { describe, expect, it } from 'vitest';

import { mockBblSourceReaderByType } from '../shared/bbl-source-reader-mock.test-helpers';
import {
  goodPlayer,
  importOptions,
  makeService,
  plPage,
} from './bbl-players-import.test-helpers';

describe('BblPlayersImportService journeymen', () => {
  it('marks a player named Journeyman whose page lists Loner, leaving the Loner out', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pl: [
          plPage({
            ...goodPlayer,
            name: 'journeyman',
            skills: [
              { name: 'Loner', source: 'advancement', advancementOrder: 1 },
              { name: 'Block', source: 'advancement', advancementOrder: 2 },
            ],
          }),
        ],
      }),
    );

    const outcome = await service.importPlayers(importOptions);

    expect(
      mocks.playersImport.upsertPlayerResult.mock.calls[0][0],
    ).toMatchObject({ isJourneyman: true });
    expect(outcome.advancementsByPlayerId.get(900)).toEqual({
      skills: [{ name: 'Block', source: 'advancement', advancementOrder: 1 }],
      characteristicIncreases: [],
    });
  });

  it('clears the marker for a player named Journeyman whose page lists no Loner', async () => {
    const skills = [
      { name: 'Block', source: 'advancement' as const, advancementOrder: 1 },
    ];
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pl: [plPage({ ...goodPlayer, name: 'Journeyman', skills })],
      }),
    );

    const outcome = await service.importPlayers(importOptions);

    expect(
      mocks.playersImport.upsertPlayerResult.mock.calls[0][0],
    ).toMatchObject({ isJourneyman: false });
    expect(outcome.advancementsByPlayerId.get(900)).toEqual({
      skills,
      characteristicIncreases: [],
    });
  });

  it('clears the marker for any other name and keeps a gained Loner', async () => {
    const skills = [
      { name: 'Loner', source: 'advancement' as const, advancementOrder: 1 },
    ];
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pl: [plPage({ ...goodPlayer, name: 'Nadiddnur', skills })],
      }),
    );

    const outcome = await service.importPlayers(importOptions);

    expect(
      mocks.playersImport.upsertPlayerResult.mock.calls[0][0],
    ).toMatchObject({ isJourneyman: false });
    expect(outcome.advancementsByPlayerId.get(900)).toEqual({
      skills,
      characteristicIncreases: [],
    });
  });
});
