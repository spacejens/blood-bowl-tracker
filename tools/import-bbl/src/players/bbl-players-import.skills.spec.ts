import { describe, expect, it } from 'vitest';

import { mockBblSourceReaderByType } from '../shared/bbl-source-reader-mock.test-helpers';
import {
  goodPlayer,
  importOptions,
  makeService,
  plPage,
} from './bbl-players-import.test-helpers';

describe('BblPlayersImportService skills', () => {
  it("accumulates every imported player's parsed skills keyed by database id", async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pl: [
          plPage({
            ...goodPlayer,
            skills: [
              { name: 'Block', source: 'starting' },
              { name: 'Dodge', source: 'advancement', advancementOrder: 1 },
            ],
          }),
        ],
      }),
    );
    mocks.playersImport.upsertPlayerResult.mockResolvedValue({
      id: 77,
      created: true,
    });

    const outcome = await service.importPlayers(importOptions);

    expect(outcome.skillsByPlayerId).toEqual(
      new Map([
        [
          77,
          [
            { name: 'Block', source: 'starting' },
            { name: 'Dodge', source: 'advancement', advancementOrder: 1 },
          ],
        ],
      ]),
    );
  });

  it('records no skills for a player whose upsert failed', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({
        pl: [
          plPage({
            ...goodPlayer,
            skills: [{ name: 'Block', source: 'starting' }],
          }),
        ],
      }),
    );
    mocks.playersImport.upsertPlayerResult.mockResolvedValue(undefined);

    const outcome = await service.importPlayers(importOptions);

    expect(outcome.skillsByPlayerId.size).toBe(0);
  });

  it('records no skills for a player whose page listed none', async () => {
    const { service, mocks } = await makeService(
      mockBblSourceReaderByType({ pl: [plPage(goodPlayer)] }),
    );
    mocks.playersImport.upsertPlayerResult.mockResolvedValue({
      id: 77,
      created: true,
    });

    const outcome = await service.importPlayers(importOptions);

    expect(outcome.skillsByPlayerId.size).toBe(0);
  });
});
