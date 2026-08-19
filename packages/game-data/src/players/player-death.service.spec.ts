import type { Db } from '@blood-bowl-tracker/db';
import { DB, matches, matchEvents } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { desc } from 'drizzle-orm';
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
    actionType: string;
    actingPlayerId: number | null;
    actingMatchTeamId: number | null;
    consequenceMatchTeamId: number | null;
  }> = {},
) {
  return {
    matchId: 500,
    actionType: 'death',
    actingPlayerId: null,
    actingMatchTeamId: null,
    consequenceMatchTeamId: victimSide.matchTeamId,
    ...overrides,
  };
}

/** A `match_events` kill row caused by player 1, with per-test overrides. */
function killEvent(
  overrides: Partial<{
    matchId: number;
    actionType: string;
    actingMatchTeamId: number | null;
    consequencePlayerId: number | null;
    consequenceMatchTeamId: number | null;
  }> = {},
) {
  return {
    matchId: 500,
    actionType: 'death',
    actingMatchTeamId: orcSide.matchTeamId,
    consequencePlayerId: null,
    consequenceMatchTeamId: victimSide.matchTeamId,
    ...overrides,
  };
}

/** The perpetrator's own player row, as `findPlayerSummary` resolves it. */
const perpetrator = {
  playerName: 'Varag Ghoul-Chewer',
  positionName: 'Blitzer',
  teamId: orcSide.teamId,
};

/** The display-only forms of the sides, without the internal matchTeamId. */
const { matchTeamId: _victimMatchTeamId, ...victimTeam } = victimSide;
const { matchTeamId: _undeadMatchTeamId, ...undeadTeam } = undeadSide;

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
      expect(chains[0].orderBy).toHaveBeenCalledWith(matchEvents.id);
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
        [
          {
            playerName: 'Varag Ghoul-Chewer',
            positionName: 'Blitzer',
            teamId: orcSide.teamId,
          },
        ],
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
        viaFoul: false,
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

    it('gives a known killer player priority over team ambiguity in a merged multi-team match', async () => {
      // actingMatchTeamId is null (not recorded) and the match has more than
      // one non-victim side, which would make the team-based fallback
      // ambiguous — but the killer's own player row names their team
      // directly, so the result must still be a precise `player` kind, not
      // `ambiguousTeams`.
      const { service, chains } = await build(
        [deathEvent({ actingPlayerId: 77 })],
        [victimSide, orcSide, undeadSide],
        [
          {
            playerName: 'Bloodspite Ripfang',
            positionName: 'Werewolf',
            teamId: undeadSide.teamId,
          },
        ],
      );

      await expect(service.getKillerInfo(1)).resolves.toEqual({
        kind: 'player',
        playerId: 77,
        playerName: 'Bloodspite Ripfang',
        positionName: 'Werewolf',
        teamId: 13,
        teamName: 'Champions of Death',
        raceId: 6,
        raceName: 'Undead',
        coachId: 23,
        coachName: 'Mortis',
        viaFoul: false,
      });
      // Exactly 3 queries: death event, match sides, killer-with-team.
      expect(chains).toHaveLength(3);
    });

    it('falls back to team-based resolution when the killer player lookup finds no match', async () => {
      // Defensive branch: actingPlayerId is set (so the data claims to know
      // the killer), but the players lookup returns no row. This should not
      // happen from any known importer behaviour, but the code must not
      // throw — it falls through to the existing team-based resolution.
      const { service } = await build(
        [
          deathEvent({
            actingPlayerId: 77,
            actingMatchTeamId: orcSide.matchTeamId,
          }),
        ],
        [victimSide, orcSide],
        [],
      );

      await expect(service.getKillerInfo(1)).resolves.toEqual({
        kind: 'team',
        teamId: 12,
        teamName: 'Gouged Eye',
        raceId: 5,
        raceName: 'Orc',
        coachId: 22,
        coachName: 'Grimly',
        viaFoul: false,
      });
    });

    it("falls back to team-based resolution when the killer's team is not among this match's sides", async () => {
      // Defensive branch: actingPlayerId is set and the players lookup finds a
      // row, but that row's teamId does not match any of this match's sides
      // (e.g. undeadSide, which is not part of this match at all). This
      // should not happen from any known importer behaviour, but the code
      // must not throw — it falls through to the existing team-based
      // resolution, same as when the killer lookup finds no row at all.
      const { service } = await build(
        [
          deathEvent({
            actingPlayerId: 77,
            actingMatchTeamId: orcSide.matchTeamId,
          }),
        ],
        [victimSide, orcSide],
        [
          {
            playerName: 'Bloodspite Ripfang',
            positionName: 'Werewolf',
            teamId: undeadSide.teamId,
          },
        ],
      );

      await expect(service.getKillerInfo(1)).resolves.toEqual({
        kind: 'team',
        teamId: 12,
        teamName: 'Gouged Eye',
        raceId: 5,
        raceName: 'Orc',
        coachId: 22,
        coachName: 'Grimly',
        viaFoul: false,
      });
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
        viaFoul: false,
      });
      // No third query: with no acting player there is nobody to name.
      expect(chains).toHaveLength(2);
      // Guards against e.g. a transposed team_eras/teams join that would
      // otherwise pass silently, since mockDb returns canned rows regardless
      // of actual join correctness.
      expect(
        extractJoinColumns(firstCallArg(chains[1].innerJoin, 0, 1)),
      ).toEqual(['team_eras.id', 'match_teams.team_era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[1].innerJoin, 1, 1)),
      ).toEqual(['teams.id', 'team_eras.team_id']);
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
        viaFoul: false,
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
        viaFoul: false,
      });
    });

    it("excludes the victim's own team when neither the acting side nor the victim's side was recorded", async () => {
      // Both actingMatchTeamId and consequenceMatchTeamId are null (neither
      // side was recorded on this event), and the match has several teams
      // including the victim's own (victimSide). Without excluding the
      // victim's own team via their player row, every side — including
      // victimSide — would remain a candidate, which can never be the
      // victim's own killer.
      const { service } = await build(
        [deathEvent({ actingMatchTeamId: null, consequenceMatchTeamId: null })],
        [victimSide, orcSide, undeadSide],
        [{ playerName: 'Griff Oberwald', positionName: 'Blitzer', teamId: 11 }],
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
        viaFoul: false,
      });
    });

    it('falls back to unknown when no other team can be found', async () => {
      const { service } = await build([deathEvent()], [victimSide]);

      await expect(service.getKillerInfo(1)).resolves.toEqual({
        kind: 'unknown',
        viaFoul: false,
      });
    });

    it('falls back to unknown when the named acting match team is missing', async () => {
      const { service } = await build(
        [deathEvent({ actingPlayerId: 77, actingMatchTeamId: 999 })],
        [victimSide, orcSide],
      );

      await expect(service.getKillerInfo(1)).resolves.toEqual({
        kind: 'unknown',
        viaFoul: false,
      });
    });

    it('flags a death caused by a foul', async () => {
      const { service } = await build(
        [
          deathEvent({
            actionType: 'foul',
            actingMatchTeamId: orcSide.matchTeamId,
          }),
        ],
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
        viaFoul: true,
      });
    });

    it('flags a non-foul death as not via a foul on every kind', async () => {
      const { service } = await build(
        [deathEvent()],
        [victimSide, orcSide, undeadSide],
      );

      await expect(service.getKillerInfo(1)).resolves.toMatchObject({
        kind: 'ambiguousTeams',
        viaFoul: false,
      });
    });
  });

  describe('countKillsInflicted', () => {
    it('counts the death consequences this player caused', async () => {
      const { service, chains } = await build([{ count: 3 }]);

      await expect(service.countKillsInflicted(1)).resolves.toBe(3);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        1,
        'death',
      ]);
    });
  });

  describe('getKillsInflicted', () => {
    it('returns nothing and asks nothing else when the player has killed nobody', async () => {
      const { service, chains } = await build([]);

      await expect(service.getKillsInflicted(1, 30)).resolves.toEqual([]);
      expect(chains).toHaveLength(1);
    });

    it('orders newest match first, then by event id, and honours the limit', async () => {
      const { service, chains } = await build([], []);

      await service.getKillsInflicted(1, 7);

      expect(chains[0].orderBy).toHaveBeenCalledWith(
        desc(matches.playedAt),
        desc(matchEvents.id),
      );
      expect(chains[0].limit).toHaveBeenCalledWith(7);
    });

    it('resolves an identified victim with their position, team, race and coach', async () => {
      const { service } = await build(
        [killEvent({ consequencePlayerId: 88 })],
        [perpetrator],
        [victimSide, orcSide],
        [
          {
            playerName: 'Griff Oberwald',
            positionName: 'Blitzer',
            teamId: victimSide.teamId,
          },
        ],
      );

      await expect(service.getKillsInflicted(1, 30)).resolves.toEqual([
        {
          kind: 'player',
          playerId: 88,
          playerName: 'Griff Oberwald',
          positionName: 'Blitzer',
          ...victimTeam,
          viaFoul: false,
        },
      ]);
    });

    it('falls back to the victim team when the victim player row is missing', async () => {
      const { service } = await build(
        [killEvent({ consequencePlayerId: 88 })],
        [perpetrator],
        [victimSide, orcSide],
        [],
      );

      await expect(service.getKillsInflicted(1, 30)).resolves.toEqual([
        { kind: 'team', ...victimTeam, viaFoul: false },
      ]);
    });

    it('resolves the victim team when no victim player is named', async () => {
      const { service } = await build(
        [killEvent()],
        [perpetrator],
        [victimSide, orcSide],
      );

      await expect(service.getKillsInflicted(1, 30)).resolves.toEqual([
        { kind: 'team', ...victimTeam, viaFoul: false },
      ]);
    });

    it('infers the single opposing side when the victim side was not recorded', async () => {
      const { service } = await build(
        [killEvent({ consequenceMatchTeamId: null })],
        [perpetrator],
        [victimSide, orcSide],
      );

      await expect(service.getKillsInflicted(1, 30)).resolves.toEqual([
        { kind: 'team', ...victimTeam, viaFoul: false },
      ]);
    });

    it('reports every possible victim side in a merged multi-team match', async () => {
      const { service } = await build(
        [killEvent({ consequenceMatchTeamId: null })],
        [perpetrator],
        [victimSide, orcSide, undeadSide],
      );

      await expect(service.getKillsInflicted(1, 30)).resolves.toEqual([
        {
          kind: 'ambiguousTeams',
          teams: [victimTeam, undeadTeam],
          viaFoul: false,
        },
      ]);
    });

    it("excludes the perpetrator's own side via their player row when no acting side was recorded", async () => {
      const { service } = await build(
        [killEvent({ actingMatchTeamId: null, consequenceMatchTeamId: null })],
        [perpetrator],
        [victimSide, orcSide],
      );

      await expect(service.getKillsInflicted(1, 30)).resolves.toEqual([
        { kind: 'team', ...victimTeam, viaFoul: false },
      ]);
    });

    it('falls back to unknown when no candidate side remains', async () => {
      const { service } = await build(
        [killEvent({ consequenceMatchTeamId: null })],
        [perpetrator],
        [orcSide],
      );

      await expect(service.getKillsInflicted(1, 30)).resolves.toEqual([
        { kind: 'unknown', viaFoul: false },
      ]);
    });

    it('flags a kill inflicted by a foul', async () => {
      const { service } = await build(
        [killEvent({ actionType: 'foul' })],
        [perpetrator],
        [victimSide, orcSide],
      );

      await expect(service.getKillsInflicted(1, 30)).resolves.toEqual([
        { kind: 'team', ...victimTeam, viaFoul: true },
      ]);
    });

    it('looks a match up once even when it holds several kills', async () => {
      const { service, chains } = await build(
        [killEvent(), killEvent()],
        [perpetrator],
        [victimSide, orcSide],
      );

      const kills = await service.getKillsInflicted(1, 30);

      expect(kills).toHaveLength(2);
      // Kill events, perpetrator row, one match-sides lookup — not two.
      expect(chains).toHaveLength(3);
    });
  });
});
