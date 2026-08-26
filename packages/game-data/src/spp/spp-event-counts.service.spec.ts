import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  extractAllFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { SppEventCountsService } from './spp-event-counts.service';

async function makeService(db: MockDbResult): Promise<SppEventCountsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [SppEventCountsService, { provide: DB, useValue: db.db }],
  }).compile();
  return moduleRef.get(SppEventCountsService);
}

describe('SppEventCountsService', () => {
  it('returns a zero-filled count for every requested player', async () => {
    const service = await makeService(mockDb([]));

    expect(await service.importedCountsForPlayers([7])).toEqual(
      new Map([
        [
          7,
          {
            touchdown: 0,
            completion: 0,
            interception: 0,
            mvp_award: 0,
            casualty: 0,
          },
        ],
      ]),
    );
  });

  it('folds each action type into its career-count group', async () => {
    const service = await makeService(
      mockDb([
        { playerId: 1, actionType: 'touchdown', count: 9 },
        { playerId: 1, actionType: 'completion', count: 2 },
        { playerId: 1, actionType: 'mvp_award', count: 3 },
      ]),
    );

    expect((await service.importedCountsForPlayers([1])).get(1)).toEqual({
      touchdown: 9,
      completion: 2,
      interception: 0,
      mvp_award: 3,
      casualty: 0,
    });
  });

  it('adds deflections into the interception group', async () => {
    // TP reports one combined interception counter, so the imported side has
    // to be grouped the same way for the comparison to mean anything.
    const service = await makeService(
      mockDb([
        { playerId: 1, actionType: 'interception', count: 2 },
        { playerId: 1, actionType: 'deflection', count: 3 },
      ]),
    );

    const counts = await service.importedCountsForPlayers([1]);
    expect(counts.get(1)?.interception).toBe(5);
  });

  it('adds every casualty severity into the casualty group', async () => {
    const service = await makeService(
      mockDb([
        { playerId: 1, actionType: 'casualty', count: 1 },
        { playerId: 1, actionType: 'badly_hurt', count: 2 },
        { playerId: 1, actionType: 'serious_injury', count: 3 },
        { playerId: 1, actionType: 'death', count: 4 },
      ]),
    );

    const counts = await service.importedCountsForPlayers([1]);
    expect(counts.get(1)?.casualty).toBe(10);
  });

  it('ignores a row whose action type belongs to no group', async () => {
    // action_type is a nullable column, and a row could carry a type outside
    // the SPP-earning set if the filter were ever loosened; neither may crash.
    const service = await makeService(
      mockDb([
        { playerId: 1, actionType: null, count: 4 },
        { playerId: 1, actionType: 'foul', count: 5 },
        { playerId: 1, actionType: 'touchdown', count: 1 },
      ]),
    );

    expect((await service.importedCountsForPlayers([1])).get(1)).toEqual({
      touchdown: 1,
      completion: 0,
      interception: 0,
      mvp_award: 0,
      casualty: 0,
    });
  });

  it('ignores a row for a player that was not requested', async () => {
    const service = await makeService(
      mockDb([{ playerId: 99, actionType: 'touchdown', count: 4 }]),
    );

    const counts = await service.importedCountsForPlayers([1]);
    expect(counts.has(99)).toBe(false);
    expect(counts.get(1)?.touchdown).toBe(0);
  });

  it('deduplicates the requested ids and filters on them', async () => {
    const db = mockDb([]);
    const service = await makeService(db);

    await service.importedCountsForPlayers([1, 1, 2]);

    const filtered = extractAllFilterValues(firstCallArg(db.chains[0].where));
    expect(filtered).toContain(1);
    expect(filtered).toContain(2);
  });

  it('issues no query for an empty id list', async () => {
    const db = mockDb();
    const service = await makeService(db);

    expect(await service.importedCountsForPlayers([])).toEqual(new Map());
    expect(db.chains).toHaveLength(0);
  });
});
