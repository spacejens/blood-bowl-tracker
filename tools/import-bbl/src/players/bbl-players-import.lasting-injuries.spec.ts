import { describe, expect, it } from 'vitest';

import { mockBblSourceReaderByType } from '../shared/bbl-source-reader-mock.test-helpers';
import {
  goodPlayer,
  importOptions,
  makeService,
  plPage,
} from './bbl-players-import.test-helpers';

const INJURED = {
  missNextGame: true,
  nigglingInjuryCount: 2,
  moveReductionCount: 0,
  strengthReductionCount: 0,
  agilityReductionCount: 0,
  passingReductionCount: 0,
  armourReductionCount: 1,
};

describe('BblPlayersImportService lasting injuries', () => {
  it("sends the player's parsed lasting-injury state", async () => {
    const injuredPlayer = { ...goodPlayer, lastingInjuries: INJURED };
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(injuredPlayer)] }),
    );

    await service.importPlayers(importOptions);

    expect(mocks.playersImport.upsertPlayerResult).toHaveBeenCalledWith(
      expect.objectContaining(INJURED),
      expect.anything(),
    );
  });

  it('reports only the players this run inserted', async () => {
    const secondPlayer = { ...goodPlayer, pid: '43' };
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pl: [plPage(goodPlayer), plPage(secondPlayer)],
      }),
    );
    mocks.playersImport.upsertPlayerResult
      .mockResolvedValueOnce({ id: 900, created: true })
      .mockResolvedValueOnce({ id: 901, created: false });

    const outcome = await service.importPlayers(importOptions);

    expect(outcome.insertedPlayerIds).toEqual([900]);
  });

  it('reports no inserted ids when every player already existed', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
    );
    mocks.playersImport.upsertPlayerResult.mockResolvedValue({
      id: 900,
      created: false,
    });

    const outcome = await service.importPlayers(importOptions);

    expect(outcome.insertedPlayerIds).toEqual([]);
  });
});
