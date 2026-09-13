import { DB, matchEvents, players } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  extractAllFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { PlayerLastingInjuryBackfillService } from './player-lasting-injury-backfill.service';

/** A player row as the service's first query selects it. */
function current(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    missNextGame: false,
    nigglingInjuryCount: 0,
    moveReductionCount: 0,
    strengthReductionCount: 0,
    agilityReductionCount: 0,
    passingReductionCount: 0,
    armourReductionCount: 0,
    ...overrides,
  };
}

async function build(
  ...rowsPerQuery: unknown[][]
): Promise<{ service: PlayerLastingInjuryBackfillService; db: MockDbResult }> {
  const db = mockDb(...rowsPerQuery);
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerLastingInjuryBackfillService,
      { provide: DB, useValue: db.db },
    ],
  }).compile();
  return { service: moduleRef.get(PlayerLastingInjuryBackfillService), db };
}

describe('PlayerLastingInjuryBackfillService', () => {
  it('issues no query at all for an empty player list', async () => {
    const { service, db } = await build();

    await expect(
      service.syncLastingInjuryHistory({ playerIds: [] }),
    ).resolves.toEqual({ backfilledPlayerIds: [] });

    expect(db.chains).toHaveLength(0);
  });

  it('leaves a player whose events agree with their current row untouched', async () => {
    // Query 0: the current rows. Query 1: the per-type event counts.
    const { service, db } = await build(
      [current({ nigglingInjuryCount: 1 })],
      [{ playerId: 7, consequenceType: 'niggling_injury', total: 1 }],
    );

    await expect(
      service.syncLastingInjuryHistory({ playerIds: [7] }),
    ).resolves.toEqual({ backfilledPlayerIds: [] });

    expect(db.chains).toHaveLength(2);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('writes the accumulated state and then the current state back, in that order', async () => {
    const { service, db } = await build(
      // The player is currently clean: the niggling injury was healed.
      [current()],
      [{ playerId: 7, consequenceType: 'niggling_injury', total: 2 }],
    );

    await expect(
      service.syncLastingInjuryHistory({ playerIds: [7] }),
    ).resolves.toEqual({ backfilledPlayerIds: [7] });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    // Queries 2 and 3 are the two UPDATEs, in order.
    expect(firstCallArg(db.chains[2].set)).toMatchObject({
      nigglingInjuryCount: 2,
    });
    expect(firstCallArg(db.chains[3].set)).toMatchObject({
      nigglingInjuryCount: 0,
    });
  });

  it('maps each stat-reduction consequence type onto its own count', async () => {
    const { service, db } = await build(
      [current()],
      [
        { playerId: 7, consequenceType: 'stat_reduction_ma', total: 1 },
        { playerId: 7, consequenceType: 'stat_reduction_st', total: 2 },
        { playerId: 7, consequenceType: 'stat_reduction_ag', total: 3 },
        { playerId: 7, consequenceType: 'stat_reduction_pa', total: 4 },
        { playerId: 7, consequenceType: 'stat_reduction_av', total: 5 },
      ],
    );

    await service.syncLastingInjuryHistory({ playerIds: [7] });

    expect(firstCallArg(db.chains[2].set)).toMatchObject({
      moveReductionCount: 1,
      strengthReductionCount: 2,
      agilityReductionCount: 3,
      passingReductionCount: 4,
      armourReductionCount: 5,
    });
  });

  it('never writes missNextGame, keeping both versions at the current value', async () => {
    const { service, db } = await build(
      [current({ missNextGame: true })],
      [{ playerId: 7, consequenceType: 'niggling_injury', total: 1 }],
    );

    await service.syncLastingInjuryHistory({ playerIds: [7] });

    expect(firstCallArg(db.chains[2].set)).toMatchObject({
      missNextGame: true,
    });
    expect(firstCallArg(db.chains[3].set)).toMatchObject({
      missNextGame: true,
    });
  });

  it('reads counts off match_events by consequence player, for the named players only', async () => {
    const { service, db } = await build([current()], []);

    await service.syncLastingInjuryHistory({ playerIds: [7] });

    expect(db.chains[0].from).toHaveBeenCalledWith(players);
    expect(db.chains[1].from).toHaveBeenCalledWith(matchEvents);
    expect(extractAllFilterValues(firstCallArg(db.chains[1].where))).toEqual(
      expect.arrayContaining([7, 'niggling_injury']),
    );
    // miss_next_game clears after exactly one game, so including it would
    // flag nearly every player who has ever been hurt.
    expect(
      extractAllFilterValues(firstCallArg(db.chains[1].where)),
    ).not.toContain('miss_next_game');
  });

  it('backfills several players independently', async () => {
    const { service } = await build(
      [current({ id: 7 }), current({ id: 8, armourReductionCount: 1 })],
      [
        { playerId: 7, consequenceType: 'niggling_injury', total: 1 },
        { playerId: 8, consequenceType: 'stat_reduction_av', total: 1 },
      ],
    );

    await expect(
      service.syncLastingInjuryHistory({ playerIds: [7, 8] }),
    ).resolves.toEqual({ backfilledPlayerIds: [7] });
  });

  it('skips a player id with no row in the database', async () => {
    const { service } = await build([], []);

    await expect(
      service.syncLastingInjuryHistory({ playerIds: [999] }),
    ).resolves.toEqual({ backfilledPlayerIds: [] });
  });
});
