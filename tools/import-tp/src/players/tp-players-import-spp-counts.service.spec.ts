import { describe, expect, it, vi } from 'vitest';

import type { RosterEntry } from '../source/roster-collection.service';
import { makeService, rosters } from './tp-players-import.test-helpers';

/** The shared `rosters` fixture's one player, with `careerCounts` overridden
 * (or omitted) per test. */
function rostersWithCareerCounts(
  careerCounts: RosterEntry['roster']['players'][number]['careerCounts'],
): RosterEntry[] {
  const [entry] = rosters;
  return [
    {
      ...entry,
      roster: {
        ...entry.roster,
        players: [{ ...entry.roster.players[0], careerCounts }],
      },
    },
  ];
}

describe('TpPlayersImportService career counts', () => {
  it('returns the roster players career counts keyed by DB player id', async () => {
    // The roster file's TP counters, remapped onto the action-type keys the
    // server prices them with.
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service } = await makeService({ upsertPlayerResult });

    const outcome = await service.importPlayers({
      rosters: rostersWithCareerCounts({
        touchdowns: 12,
        completions: 4,
        interceptions: 2,
        mvpAwards: 3,
        casualties: 5,
      }),
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
    });

    expect(outcome.careerSppCountsByPlayerId).toEqual(
      new Map([
        [
          outcome.playerIdsByLineUpId.get(2412443),
          {
            touchdown: 12,
            completion: 4,
            interception: 2,
            mvp_award: 3,
            casualty: 5,
          },
        ],
      ]),
    );
    expect(upsertPlayerResult).toHaveBeenCalledTimes(1);
  });

  it('omits a player whose source entry carried no career counts', async () => {
    // A player only ever seen in a match-embedded roster snapshot has no
    // counters, so it contributes no ongoing-competition estimate.
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service } = await makeService({ upsertPlayerResult });

    const outcome = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
    });

    expect(outcome.careerSppCountsByPlayerId.size).toBe(0);
  });

  it('keeps the highest count seen per group across sources', async () => {
    // Career counters only ever increase, so a stale snapshot must not lower a
    // fresher one -- the same rule the sppTotal maximum already follows.
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service } = await makeService({ upsertPlayerResult });
    const [entry] = rosters;
    // Two RosterEntry rows for the same roster id, each a separate snapshot
    // in time carrying the same player id with differing counters -- the
    // pre-scan must take the per-group maximum across both.
    const twoSnapshots: RosterEntry[] = [
      {
        ...entry,
        roster: {
          ...entry.roster,
          players: [
            {
              ...entry.roster.players[0],
              careerCounts: {
                touchdowns: 12,
                completions: 1,
                interceptions: 0,
                mvpAwards: 3,
                casualties: 5,
              },
            },
          ],
        },
      },
      {
        ...entry,
        roster: {
          ...entry.roster,
          players: [
            {
              ...entry.roster.players[0],
              careerCounts: {
                touchdowns: 9,
                completions: 4,
                interceptions: 0,
                mvpAwards: 3,
                casualties: 5,
              },
            },
          ],
        },
      },
    ];

    const outcome = await service.importPlayers({
      rosters: twoSnapshots,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
    });

    expect(
      outcome.careerSppCountsByPlayerId.get(
        outcome.playerIdsByLineUpId.get(2412443) as number,
      ),
    ).toEqual({
      touchdown: 12,
      completion: 4,
      interception: 0,
      mvp_award: 3,
      casualty: 5,
    });
  });
});
