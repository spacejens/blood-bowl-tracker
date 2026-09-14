import { DB, matchEvents, players } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { LASTING_INJURY_SUFFERED_TYPES } from '../shared/match-event-types';
import {
  extractAllFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import {
  COUNTER_BY_CONSEQUENCE_TYPE,
  PlayerLastingInjuryBackfillService,
} from './player-lasting-injury-backfill.service';

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
  it('has an accumulator counter for every lasting-injury suffered type', () => {
    // COUNTER_BY_CONSEQUENCE_TYPE and LASTING_INJURY_SUFFERED_TYPES are two
    // independently-maintained lists of the same six consequence types; this
    // catches future drift between them.
    expect(
      LASTING_INJURY_SUFFERED_TYPES.every(
        (type) => COUNTER_BY_CONSEQUENCE_TYPE[type] !== undefined,
      ),
    ).toBe(true);
  });

  it('issues no query at all for an empty player list', async () => {
    const { service, db } = await build();

    await expect(
      service.syncLastingInjuryHistory({ playerIds: [] }),
    ).resolves.toEqual({ backfilledPlayerIds: [] });

    expect(db.chains).toHaveLength(0);
  });

  it('leaves a player whose current row already shows an outstanding injury untouched', async () => {
    // Query 0: the current rows. Query 1: the per-type event counts. The
    // player's current row is not entirely clean, so no backfill pair is
    // written even though it happens to agree with the accumulated count.
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

  it('leaves a player whose current row shows an outstanding injury untouched, even when the raw event count differs', async () => {
    // BBL's "(no effect)" tag still records a match event even when the
    // stat was already at its floor/cap, so the raw accumulated count can
    // exceed the real (capped) magnitude stored on an already-injured
    // player. Since the player is not currently clean, no backfill pair
    // should be written regardless of that mismatch.
    const { service, db } = await build(
      [current({ armourReductionCount: 1 })],
      [{ playerId: 7, consequenceType: 'stat_reduction_av', total: 2 }],
    );

    await expect(
      service.syncLastingInjuryHistory({ playerIds: [7] }),
    ).resolves.toEqual({ backfilledPlayerIds: [] });

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('leaves a player currently flagged to miss the next game untouched, even if match events differ', async () => {
    // missNextGame === true means the player is not in the "entirely
    // clean" state the backfill targets, regardless of what the event
    // counts say.
    const { service, db } = await build(
      [current({ missNextGame: true })],
      [{ playerId: 7, consequenceType: 'niggling_injury', total: 1 }],
    );

    await expect(
      service.syncLastingInjuryHistory({ playerIds: [7] }),
    ).resolves.toEqual({ backfilledPlayerIds: [] });

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('backfills a clean player even when the only recorded event was a "no effect" reduction', async () => {
    // The player's current row is entirely clean (never had an effective
    // reduction of any kind), but their match-event history records one
    // stat-reduction roll that BBL reported as having no numeric effect.
    // The current value legitimately stays 0, but the history still proves
    // the player was once hit with a lasting-injury roll — exactly what the
    // healed stratum is meant to surface.
    const { service, db } = await build(
      [current()],
      [{ playerId: 7, consequenceType: 'stat_reduction_st', total: 1 }],
    );

    await expect(
      service.syncLastingInjuryHistory({ playerIds: [7] }),
    ).resolves.toEqual({ backfilledPlayerIds: [7] });

    // Queries 0-1 are the current/accumulated reads; 2 is the in-transaction
    // row lock, 3 the in-transaction already-backfilled recheck, and 4-5 are
    // the two UPDATEs.
    expect(firstCallArg(db.chains[4].set)).toMatchObject({
      strengthReductionCount: 1,
    });
    expect(firstCallArg(db.chains[5].set)).toMatchObject({
      strengthReductionCount: 0,
    });
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
    // Queries 4 and 5 are the two UPDATEs, in order (0-1 are the
    // current/accumulated reads outside the transaction; 2-3 are the
    // in-transaction row lock and already-backfilled recheck).
    expect(firstCallArg(db.chains[4].set)).toMatchObject({
      nigglingInjuryCount: 2,
    });
    expect(firstCallArg(db.chains[5].set)).toMatchObject({
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

    expect(firstCallArg(db.chains[4].set)).toMatchObject({
      moveReductionCount: 1,
      strengthReductionCount: 2,
      agilityReductionCount: 3,
      passingReductionCount: 4,
      armourReductionCount: 5,
    });
  });

  it('never writes missNextGame, keeping both versions at the current value', async () => {
    // missNextGame must be false for the player to be eligible for backfill
    // at all (see the "currently flagged to miss the next game" test
    // above), so the only value this pass-through can be observed carrying
    // through both writes is false.
    const { service, db } = await build(
      [current({ missNextGame: false })],
      [{ playerId: 7, consequenceType: 'niggling_injury', total: 1 }],
    );

    await service.syncLastingInjuryHistory({ playerIds: [7] });

    expect(firstCallArg(db.chains[4].set)).toMatchObject({
      missNextGame: false,
    });
    expect(firstCallArg(db.chains[5].set)).toMatchObject({
      missNextGame: false,
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

  it('leaves a player with nonzero current counts untouched when no matching match events exist at all', async () => {
    // The player is not "currently clean" (nonzero armourReductionCount), so
    // even though the accumulated/history-derived state (nothing recorded)
    // is LOWER than the current real state, the isCurrentlyClean gate must
    // still block a backfill.
    const { service, db } = await build(
      [current({ armourReductionCount: 1 })],
      [],
    );

    await expect(
      service.syncLastingInjuryHistory({ playerIds: [7] }),
    ).resolves.toEqual({ backfilledPlayerIds: [] });

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('writes two adjacent update pairs, one per player, when backfilling multiple players', async () => {
    const { service, db } = await build(
      [current({ id: 7 }), current({ id: 8 })],
      [
        { playerId: 7, consequenceType: 'niggling_injury', total: 1 },
        { playerId: 8, consequenceType: 'stat_reduction_av', total: 1 },
      ],
    );

    await expect(
      service.syncLastingInjuryHistory({ playerIds: [7, 8] }),
    ).resolves.toEqual({ backfilledPlayerIds: [7, 8] });

    // Queries 0-1 are the current/accumulated reads outside the transaction.
    // Inside it, each player contributes a row lock, an already-backfilled
    // recheck, and its two UPDATEs (4 queries per player): player 7 at
    // indices 2-5, player 8 at indices 6-9. The UPDATE pairs must appear as
    // player 7's accumulated-then-real pair immediately followed by player
    // 8's, never interleaved or reordered, since the versioning() trigger
    // relies on each pair being adjacent.
    expect(db.chains).toHaveLength(10);
    expect(firstCallArg(db.chains[4].set)).toMatchObject({
      nigglingInjuryCount: 1,
    });
    expect(firstCallArg(db.chains[5].set)).toMatchObject({
      nigglingInjuryCount: 0,
    });
    expect(firstCallArg(db.chains[8].set)).toMatchObject({
      armourReductionCount: 1,
    });
    expect(firstCallArg(db.chains[9].set)).toMatchObject({
      armourReductionCount: 0,
    });
  });

  it('skips a player who was already backfilled by a prior call', async () => {
    // The player is currently clean and their match-event history proves a
    // past injury -- normally enough to qualify for backfill -- but the
    // in-transaction recheck (query 3, after the row lock at query 2) finds a
    // players_history row already showing a non-default lasting-injury
    // value, meaning a prior call already wrote the manufactured pair. This
    // is the same recheck that closes the TOCTOU race between two concurrent
    // calls: whichever transaction's lock wins runs this query second and
    // sees the other's now-committed write. A repeated call (e.g. a retried
    // RPC request) must be a safe no-op rather than manufacturing a second
    // pair.
    const { service, db } = await build(
      [current()],
      [{ playerId: 7, consequenceType: 'niggling_injury', total: 2 }],
      [], // query 2: the row-lock SELECT; its rows are never read.
      [{ id: 7 }], // query 3: the in-transaction already-backfilled recheck.
    );

    await expect(
      service.syncLastingInjuryHistory({ playerIds: [7] }),
    ).resolves.toEqual({ backfilledPlayerIds: [] });

    // The transaction still opens (the lock and recheck happen inside it),
    // but neither UPDATE pair is issued once the recheck finds the row.
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.chains).toHaveLength(4);
  });

  it('locks the player row for update before the in-transaction recheck', async () => {
    // Fix for a TOCTOU race: the idempotency check must run under a row lock
    // inside the same transaction that performs the writes, not as a plain
    // read before the transaction opens. This asserts the lock is actually
    // requested with FOR UPDATE semantics on the correct table.
    const { service, db } = await build(
      [current()],
      [{ playerId: 7, consequenceType: 'niggling_injury', total: 1 }],
      [],
      [],
    );

    await service.syncLastingInjuryHistory({ playerIds: [7] });

    // Query 2 is the in-transaction row lock.
    expect(db.chains[2].from).toHaveBeenCalledWith(players);
    expect(db.chains[2].for).toHaveBeenCalledWith('update');
  });

  it('skips a player id with no row in the database', async () => {
    const { service } = await build([], []);

    await expect(
      service.syncLastingInjuryHistory({ playerIds: [999] }),
    ).resolves.toEqual({ backfilledPlayerIds: [] });
  });
});
