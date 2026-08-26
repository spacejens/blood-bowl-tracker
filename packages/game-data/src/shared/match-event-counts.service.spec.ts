import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { MatchEventCountsService } from './match-event-counts.service';
import { MatchScopeFilterService } from './match-scope-filter.service';
import {
  extractAllFilterValues,
  extractJoinColumns,
  firstCallArg,
} from './query-assertions.test-helpers';

describe('MatchEventCountsService', () => {
  let service: MatchEventCountsService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        MatchEventCountsService,
        MatchScopeFilterService,
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(MatchEventCountsService);
    return { db, chains };
  }

  describe('countMatchEventsByPlayer', () => {
    it('returns the rows the query resolves to', async () => {
      const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 7 }];
      const { db } = await build(rows);
      await expect(
        service.countMatchEventsByPlayer({
          selector: { role: 'acting', types: ['touchdown'] },
          limit: 21,
        }),
      ).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('joins six tables for the acting role', async () => {
      const { chains } = await build([]);
      await service.countMatchEventsByPlayer({
        selector: { role: 'acting', types: ['touchdown'] },
        limit: 21,
      });
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(6);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['players.id', 'match_events.acting_player_id']);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'touchdown',
        false,
      ]);
    });

    it('applies the SQL limit to the query', async () => {
      const { chains } = await build([]);
      await service.countMatchEventsByPlayer({
        selector: { role: 'acting', types: ['touchdown'] },
        limit: 21,
      });
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('joins six tables for the consequence role', async () => {
      const { chains } = await build([]);
      await service.countMatchEventsByPlayer({
        selector: { role: 'consequence', types: ['sent_off'] },
        limit: 21,
      });
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(6);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['players.id', 'match_events.consequence_player_id']);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'sent_off',
        false,
      ]);
    });

    it('excludes star players from the ranking', async () => {
      const { chains } = await build([]);
      await service.countMatchEventsByPlayer({
        selector: { role: 'acting', types: ['touchdown'] },
        scope: { leagueId: 9 },
        limit: 21,
      });
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(6);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 5, 1)),
      ).toEqual(['positions.id', 'players.position_id']);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'touchdown',
        9,
        false,
      ]);
    });
  });

  describe('countMatchEventsByTeam', () => {
    it('returns the rows the query resolves to', async () => {
      const rows = [{ teamId: 1, name: 'Reikland Reavers', count: 4 }];
      const { db } = await build(rows);
      await expect(
        service.countMatchEventsByTeam({
          selector: { role: 'acting', types: ['touchdown'] },
          limit: 21,
        }),
      ).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('joins five tables for the consequence role', async () => {
      const { chains } = await build([]);
      await service.countMatchEventsByTeam({
        selector: { role: 'consequence', types: ['death'] },
        limit: 21,
      });
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(5);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['match_teams.id', 'match_events.consequence_match_team_id']);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'death',
      ]);
    });

    it('applies the SQL limit to the query', async () => {
      const { chains } = await build([]);
      await service.countMatchEventsByTeam({
        selector: { role: 'acting', types: ['touchdown'] },
        limit: 21,
      });
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('filters by league via the eras join when a leagueId is given', async () => {
      const { chains } = await build([]);
      await service.countMatchEventsByTeam({
        selector: { role: 'acting', types: ['touchdown'] },
        scope: { leagueId: 9 },
        limit: 21,
      });
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'touchdown',
        9,
      ]);
      expect(
        extractJoinColumns(firstCallArg(chains[0].where)).filter(
          (column) => column === 'eras.league_id',
        ),
      ).toHaveLength(1);
    });

    it('filters by match category when a category is given', async () => {
      const { chains } = await build([]);
      await service.countMatchEventsByTeam({
        selector: { role: 'acting', types: ['touchdown'] },
        scope: { category: 'season_final' },
        limit: 21,
      });
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'touchdown',
        'season_final',
      ]);
    });

    it('filters by competition and match category together when both are given', async () => {
      const { chains } = await build([]);
      await service.countMatchEventsByTeam({
        selector: { role: 'acting', types: ['touchdown'] },
        scope: { competitionId: 30, category: 'cup_final' },
        limit: 21,
      });
      // Competition first, then match category: the filters' drill-down order.
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'touchdown',
        30,
        'cup_final',
      ]);
    });
  });

  describe('countMatchEventsByCoach', () => {
    it('returns the rows the query resolves to', async () => {
      const rows = [{ coachId: 1, name: 'Roze Madder', count: 13 }];
      const { db } = await build(rows);
      await expect(
        service.countMatchEventsByCoach({
          selector: { role: 'acting', types: ['foul'] },
          limit: 21,
        }),
      ).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('joins six tables for the acting role, reaching coaches through teams', async () => {
      const { chains } = await build([]);
      await service.countMatchEventsByCoach({
        selector: { role: 'acting', types: ['foul'] },
        limit: 21,
      });
      // One more join than countMatchEventsByTeam: teams -> coaches.
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(6);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['match_teams.id', 'match_events.acting_match_team_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 5, 1)),
      ).toEqual(['coaches.id', 'teams.coach_id']);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'foul',
      ]);
    });

    it('joins the consequence side when the selector role is consequence', async () => {
      const { chains } = await build([]);
      await service.countMatchEventsByCoach({
        selector: { role: 'consequence', types: ['death'] },
        limit: 21,
      });
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['match_teams.id', 'match_events.consequence_match_team_id']);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'death',
      ]);
    });

    it('applies the SQL limit to the query', async () => {
      const { chains } = await build([]);
      await service.countMatchEventsByCoach({
        selector: { role: 'acting', types: ['foul'] },
        limit: 21,
      });
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('filters by league, era and competition when the scope is given', async () => {
      const { chains } = await build([]);
      await service.countMatchEventsByCoach({
        selector: { role: 'acting', types: ['foul'] },
        scope: { leagueId: 9, eraId: 20, competitionId: 30 },
        limit: 21,
      });
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'foul',
        9,
        20,
        30,
      ]);
      expect(
        extractJoinColumns(firstCallArg(chains[0].where)).filter(
          (column) => column === 'eras.league_id',
        ),
      ).toHaveLength(1);
    });
  });

  describe('countAllMatchEventsByPlayerForTeam', () => {
    it('counts every acting event per player for the team, capped to the limit', async () => {
      const rows = [
        {
          playerId: 1,
          name: 'Griff',
          count: 20,
          positionId: 30,
          positionName: 'Blitzer',
          isStarPlayer: false,
        },
        {
          playerId: 2,
          name: 'Morg',
          count: 11,
          positionId: 31,
          positionName: 'Morg N Thorg',
          isStarPlayer: true,
        },
      ];
      const { chains } = await build(rows);

      await expect(
        service.countAllMatchEventsByPlayerForTeam({ teamId: 7, limit: 5 }),
      ).resolves.toEqual(rows);

      expect(chains[0].limit).toHaveBeenCalledWith(5);
    });

    it('joins positions on the player position so each row knows its position', async () => {
      const { chains } = await build([]);

      await service.countAllMatchEventsByPlayerForTeam({ teamId: 7, limit: 5 });

      const joinConditions = chains[0].innerJoin.mock.calls.map((call) =>
        extractJoinColumns(call[1]),
      );
      expect(joinConditions).toContainEqual([
        'positions.id',
        'players.position_id',
      ]);
    });

    it('groups by the position columns as well as the player ones', async () => {
      const { chains } = await build([]);

      await service.countAllMatchEventsByPlayerForTeam({ teamId: 7, limit: 5 });

      const groupByColumns = chains[0].groupBy.mock.calls[0].map((column) =>
        extractJoinColumns(column).join(''),
      );
      expect(groupByColumns).toEqual([
        'players.id',
        'players.name',
        'positions.id',
        'positions.name',
        'positions.is_star_player',
      ]);
    });

    it('passes a generous limit through so a tie at the cutoff can be detected downstream', async () => {
      const rows = Array.from({ length: 8 }, (_, i) => ({
        playerId: i + 1,
        name: `Player ${i + 1}`,
        count: i < 6 ? 5 : 1,
        positionId: 20 + i,
        positionName: `Position ${i + 1}`,
        isStarPlayer: i % 2 === 0,
      }));
      const { chains } = await build(rows);
      await expect(
        service.countAllMatchEventsByPlayerForTeam({ teamId: 7, limit: 10 }),
      ).resolves.toEqual(rows);
      expect(chains[0].limit).toHaveBeenCalledWith(10);
    });
  });

  describe('countMatchEventsForPlayer', () => {
    it('returns the single count the query resolves to', async () => {
      await build([{ count: 7 }]);
      await expect(
        service.countMatchEventsForPlayer({
          playerId: 1,
          selector: { role: 'acting', types: ['touchdown'] },
        }),
      ).resolves.toBe(7);
    });

    it('filters by the acting player id alongside the type list', async () => {
      const { chains } = await build([{ count: 0 }]);
      await service.countMatchEventsForPlayer({
        playerId: 42,
        selector: { role: 'acting', types: ['mvp_award'] },
      });
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(5);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['players.id', 'match_events.acting_player_id']);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      // The where clause folds together the type-list inArray and the
      // eq(players.id, playerId) filter, so both the type and the id appear.
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'mvp_award',
        42,
      ]);
    });
  });

  describe('sumExpensiveMistakesByTeam', () => {
    it('applies the SQL limit to the query', async () => {
      const { chains } = await build([]);
      await service.sumExpensiveMistakesByTeam({ limit: 21 });
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('returns the rows the query resolves to', async () => {
      const rows = [{ teamId: 1, name: 'Reikland Reavers', count: 150000 }];
      await build(rows);
      await expect(
        service.sumExpensiveMistakesByTeam({
          scope: { eraId: 5, competitionId: 6 },
          limit: 21,
        }),
      ).resolves.toEqual(rows);
    });

    it('filters by league when a leagueId is given', async () => {
      const { chains } = await build([]);
      await service.sumExpensiveMistakesByTeam({
        scope: { leagueId: 9 },
        limit: 21,
      });
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'expensive_mistake',
        9,
      ]);
    });
  });

  describe('listBiggestExpensiveMistakes', () => {
    it('applies the SQL limit to the query', async () => {
      const { chains } = await build([]);
      await service.listBiggestExpensiveMistakes({ limit: 21 });
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('returns the labelled rows the query resolves to', async () => {
      const rows = [
        {
          teamId: 1,
          name: 'Reikland Reavers',
          count: 90000,
          date: '2026-01-02',
        },
      ];
      await build(rows);
      await expect(
        service.listBiggestExpensiveMistakes({ limit: 21 }),
      ).resolves.toEqual(rows);
    });

    it('selects the match category', async () => {
      const { db } = await build([]);
      await service.listBiggestExpensiveMistakes({ limit: 21 });
      expect(
        Object.keys(firstCallArg(db.select) as Record<string, unknown>),
      ).toContain('category');
    });

    it('filters by league when a leagueId is given', async () => {
      const { chains } = await build([]);
      await service.listBiggestExpensiveMistakes({
        scope: { leagueId: 9 },
        limit: 21,
      });
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'expensive_mistake',
        9,
      ]);
    });
  });
});
