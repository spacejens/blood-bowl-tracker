import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import type { QueryChain } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import {
  extractAllFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { PlayerDeathService } from './player-death.service';

/** The reavers' `match_teams` row (the victim's own side). */
const victimSide = {
  matchTeamId: 100,
  teamId: 11,
  teamName: 'Reikland Reavers',
  raceId: 4,
  raceName: 'Human',
  coachId: 21,
  coachName: 'Sepp',
};
const orcSide = {
  matchTeamId: 101,
  teamId: 12,
  teamName: 'Gouged Eye',
  raceId: 5,
  raceName: 'Orc',
  coachId: 22,
  coachName: 'Grimly',
};
const undeadSide = {
  matchTeamId: 102,
  teamId: 13,
  teamName: 'Champions of Death',
  raceId: 6,
  raceName: 'Undead',
  coachId: 23,
  coachName: 'Mortis',
};

/** A `match_events` death row for player 1, with per-test overrides. */
function deathEvent(
  overrides: Partial<{
    matchId: number;
    actingPlayerId: number | null;
    actingMatchTeamId: number | null;
    consequenceMatchTeamId: number | null;
  }> = {},
) {
  return {
    matchId: 500,
    actingPlayerId: null,
    actingMatchTeamId: null,
    consequenceMatchTeamId: victimSide.matchTeamId,
    ...overrides,
  };
}

async function build(...rowsPerQuery: unknown[][]): Promise<{
  service: PlayerDeathService;
  db: Db;
  chains: QueryChain[];
}> {
  const { db, chains } = mockDb(...rowsPerQuery);
  const moduleRef = await Test.createTestingModule({
    providers: [PlayerDeathService, { provide: DB, useValue: db }],
  }).compile();
  return { service: moduleRef.get(PlayerDeathService), db, chains };
}

describe('PlayerDeathService', () => {
  describe('getKillerInfo', () => {
    it('returns null when the player has no death event', async () => {
      const { service, chains } = await build([]);

      await expect(service.getKillerInfo(1)).resolves.toBeNull();
      // Only the death-event lookup is issued; nothing else is worth asking.
      expect(chains).toHaveLength(1);
    });

    it('filters the death lookup by the player and the death consequence', async () => {
      const { service, chains } = await build([]);

      await service.getKillerInfo(1);

      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        1,
        'death',
      ]);
      expect(chains[0].limit).toHaveBeenCalledWith(1);
    });

    it('resolves the acting player, their position, team, race and coach', async () => {
      const { service, chains } = await build(
        [
          deathEvent({
            actingPlayerId: 77,
            actingMatchTeamId: orcSide.matchTeamId,
          }),
        ],
        [victimSide, orcSide],
        [{ playerName: 'Varag Ghoul-Chewer', positionName: 'Blitzer' }],
      );

      await expect(service.getKillerInfo(1)).resolves.toEqual({
        kind: 'player',
        playerId: 77,
        playerName: 'Varag Ghoul-Chewer',
        positionName: 'Blitzer',
        teamId: 12,
        teamName: 'Gouged Eye',
        raceId: 5,
        raceName: 'Orc',
        coachId: 22,
        coachName: 'Grimly',
      });
      // The match's teams are looked up by match id, and the killer by
      // acting_player_id.
      expect(extractAllFilterValues(firstCallArg(chains[1].where))).toEqual([
        500,
      ]);
      expect(extractAllFilterValues(firstCallArg(chains[2].where))).toEqual([
        77,
      ]);
      expect(
        extractJoinColumns(firstCallArg(chains[2].innerJoin, 0, 1)),
      ).toEqual(['positions.id', 'players.position_id']);
    });

    it('resolves the acting team when the specific player is unidentified', async () => {
      const { service, chains } = await build(
        [deathEvent({ actingMatchTeamId: orcSide.matchTeamId })],
        [victimSide, orcSide],
      );

      await expect(service.getKillerInfo(1)).resolves.toEqual({
        kind: 'team',
        teamId: 12,
        teamName: 'Gouged Eye',
        raceId: 5,
        raceName: 'Orc',
        coachId: 22,
        coachName: 'Grimly',
      });
      // No third query: with no acting player there is nobody to name.
      expect(chains).toHaveLength(2);
    });

    it('infers the single opposing team when the event names no acting side', async () => {
      const { service } = await build([deathEvent()], [victimSide, orcSide]);

      await expect(service.getKillerInfo(1)).resolves.toEqual({
        kind: 'team',
        teamId: 12,
        teamName: 'Gouged Eye',
        raceId: 5,
        raceName: 'Orc',
        coachId: 22,
        coachName: 'Grimly',
      });
    });

    it('reports every possible team when a multi-team match leaves it ambiguous', async () => {
      const { service } = await build(
        [deathEvent()],
        [victimSide, orcSide, undeadSide],
      );

      await expect(service.getKillerInfo(1)).resolves.toEqual({
        kind: 'ambiguousTeams',
        teams: [
          {
            teamId: 12,
            teamName: 'Gouged Eye',
            raceId: 5,
            raceName: 'Orc',
            coachId: 22,
            coachName: 'Grimly',
          },
          {
            teamId: 13,
            teamName: 'Champions of Death',
            raceId: 6,
            raceName: 'Undead',
            coachId: 23,
            coachName: 'Mortis',
          },
        ],
      });
    });

    it('falls back to unknown when no other team can be found', async () => {
      const { service } = await build([deathEvent()], [victimSide]);

      await expect(service.getKillerInfo(1)).resolves.toEqual({
        kind: 'unknown',
      });
    });

    it('falls back to unknown when the named acting match team is missing', async () => {
      const { service } = await build(
        [deathEvent({ actingPlayerId: 77, actingMatchTeamId: 999 })],
        [victimSide, orcSide],
      );

      await expect(service.getKillerInfo(1)).resolves.toEqual({
        kind: 'unknown',
      });
    });
  });
});
