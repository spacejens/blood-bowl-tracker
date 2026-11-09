import type { Db } from '@blood-bowl-tracker/db';
import { DB, trophies } from '@blood-bowl-tracker/db';
import type {
  QueryChain,
  QueryOutcome,
} from '@blood-bowl-tracker/db/test-helpers';
import {
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
  mockDb,
  sqlText,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { LikePatternService } from '../shared/like-pattern.service';
import { TrophiesQueriesService } from './trophies-queries.service';

describe('TrophiesQueriesService', () => {
  let service: TrophiesQueriesService;
  let likePattern: MockProxy<LikePatternService>;

  async function build(...rowsPerQuery: QueryOutcome[]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TrophiesQueriesService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(TrophiesQueriesService);
    return { db, chains };
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
  });

  describe('searchByNamePrefix', () => {
    it('returns trophies with their competition group name, ordered by name and limited', async () => {
      const rows = [
        {
          id: 7,
          name: 'Chaos Cup',
          competitionGroupId: 4,
          competitionGroupName: 'Major',
          leagueName: null,
        },
        {
          id: 9,
          name: 'Chaos Shield',
          competitionGroupId: 5,
          competitionGroupName: 'Minor',
          leagueName: null,
        },
      ];
      likePattern.escape.mockReturnValue('cha');
      const { chains } = await build(rows);

      await expect(service.searchByNamePrefix('cha', 25)).resolves.toEqual(
        rows,
      );

      expect(chains[0].limit).toHaveBeenCalledWith(25);
      expect(chains[0].orderBy).toHaveBeenCalledWith(trophies.name);
      expect(
        extractJoinColumns(firstCallArg(chains[0].leftJoin, 0, 1)),
      ).toEqual(['competition_groups.id', 'trophies.competition_group_id']);
    });

    it('escapes LIKE metacharacters in the prefix before matching', async () => {
      likePattern.escape.mockReturnValue('50\\%\\_\\\\off');
      const { chains } = await build([]);

      await service.searchByNamePrefix('50%_\\off', 25);

      expect(likePattern.escape).toHaveBeenCalledWith('50%_\\off');
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      // The escaped pattern value is passed as a raw SQL parameter chunk.
      const condition = firstCallArg(chains[0].where) as {
        queryChunks: unknown[];
      };
      expect(condition.queryChunks).toContain('50\\%\\_\\\\off%');
    });

    it('returns both scope names from the prefix search', async () => {
      await build([
        {
          id: 3,
          name: 'Legendary Player',
          competitionGroupId: null,
          competitionGroupName: null,
          leagueName: 'tLoEG',
        },
      ]);

      expect(await service.searchByNamePrefix('Leg', 25)).toEqual([
        {
          id: 3,
          name: 'Legendary Player',
          competitionGroupId: null,
          competitionGroupName: null,
          leagueName: 'tLoEG',
        },
      ]);
    });
  });

  describe('findById', () => {
    it('returns the trophy header joined to its competition group', async () => {
      const header = {
        id: 7,
        name: 'Chaos Cup',
        description: 'The team that wins after four matches.',
        competitionGroupId: 4,
        competitionGroupName: 'Major',
        leagueId: null,
        leagueName: null,
      };
      const { chains } = await build([header]);

      await expect(service.findById(7)).resolves.toEqual(header);

      expect(
        extractJoinColumns(firstCallArg(chains[0].leftJoin, 0, 1)),
      ).toEqual(['competition_groups.id', 'trophies.competition_group_id']);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
    });

    it('carries the award rule columns in the deepdive header', async () => {
      const header = {
        id: 1,
        name: 'Top Scorer',
        description: 'Most touchdowns during the season.',
        competitionGroupId: 4,
        competitionGroupName: 'Major Season',
        leagueId: null,
        leagueName: null,
        awardRuleKind: 'max_count' as const,
        awardProcedure: null,
        awardRuleTieCutoff: 4,
        awardRuleThreshold: null,
        awardRuleMeasure: null,
      };
      await build([header]);

      const result = await service.findById(1);

      expect(result?.awardRuleKind).toBe('max_count');
      expect(result?.awardRuleTieCutoff).toBe(4);
    });

    it('returns undefined when no trophy has that id', async () => {
      await build([]);

      await expect(service.findById(999)).resolves.toBeUndefined();
    });

    it('selects the competition group id so the deepdive can link to the group', async () => {
      const { db } = await build([]);

      await service.findById(1);
      expect(Object.keys(firstCallArg(db.select) as object)).toEqual([
        'id',
        'name',
        'description',
        'competitionGroupId',
        'competitionGroupName',
        'leagueId',
        'leagueName',
        'awardRuleKind',
        'awardProcedure',
        'awardRuleTieCutoff',
        'awardRuleThreshold',
        'awardRuleMeasure',
      ]);
    });

    it('resolves a league-scoped trophy header through the league join', async () => {
      const { chains } = await build([
        {
          id: 3,
          name: 'Legendary Player',
          description: null,
          competitionGroupId: null,
          competitionGroupName: null,
          leagueId: 7,
          leagueName: 'tLoEG',
        },
      ]);

      const header = await service.findById(3);

      expect(header).toMatchObject({ leagueId: 7, leagueName: 'tLoEG' });
      // Both scope joins are outer, so a row with either scope survives.
      expect(chains[0].leftJoin).toHaveBeenCalledTimes(2);
      expect(chains[0].innerJoin).not.toHaveBeenCalled();
    });
  });

  describe('listByCompetitionGroup', () => {
    it('returns the id and name of every trophy the group awards, ordered by name', async () => {
      const rows = [
        { id: 3, name: '1st place' },
        { id: 4, name: 'Most casualties' },
      ];
      const { db, chains } = await build(rows);

      await expect(service.listByCompetitionGroup(4)).resolves.toEqual(rows);
      expect(Object.keys(firstCallArg(db.select) as object)).toEqual([
        'id',
        'name',
      ]);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(4);
      expect(chains[0].orderBy).toHaveBeenCalledTimes(1);
    });

    it('returns an empty array when the group awards no trophies', async () => {
      await build([]);

      await expect(service.listByCompetitionGroup(4)).resolves.toEqual([]);
    });
  });

  describe('listAllWithLeague', () => {
    const rows = [
      {
        id: 1,
        name: 'Chaos Cup',
        competitionGroupId: 3,
        competitionGroupName: 'Chaos Cup',
        leagueId: null,
        leagueName: null,
      },
      {
        id: 2,
        name: '1st',
        competitionGroupId: 4,
        competitionGroupName: 'Major Season',
        leagueId: null,
        leagueName: null,
      },
    ];

    it('returns the rows the query resolves to and outer-joins trophies to competition groups and leagues', async () => {
      const { db, chains } = await build(rows);
      await expect(service.listAllWithLeague({})).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].leftJoin, 0, 1)),
      ).toEqual(['competition_groups.id', 'trophies.competition_group_id']);
      expect(chains[0].innerJoin).not.toHaveBeenCalled();
    });

    it("filters by either the competition group's league id or the trophy's own when the scope carries a leagueId", async () => {
      const { chains } = await build(rows);
      await service.listAllWithLeague({ leagueId: 42 });
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        42, 42,
      ]);
      expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
        'competition_groups.league_id',
        'trophies.league_id',
      ]);
    });

    it('applies no league filter when the scope has no leagueId', async () => {
      const { chains } = await build(rows);
      await service.listAllWithLeague({});
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(firstCallArg(chains[0].where)).toBeUndefined();
    });

    it('resolves to an empty list when the catalog is empty', async () => {
      await build([]);
      await expect(service.listAllWithLeague({})).resolves.toEqual([]);
    });

    it('includes league-scoped trophies when scoping the catalog to a league', async () => {
      const { chains } = await build([]);

      await service.listAllWithLeague({ leagueId: 7 });

      // The filter is an OR over the group's league and the trophy's own,
      // so the league id appears on both sides.
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        7, 7,
      ]);
    });

    it('applies no filter to the catalog when the scope is all-time', async () => {
      const { chains } = await build([]);

      await service.listAllWithLeague({});

      expect(firstCallArg(chains[0].where)).toBeUndefined();
    });

    it('returns the trophy catalog with both scope names', async () => {
      await build([
        {
          id: 3,
          name: 'Legendary Player',
          competitionGroupId: null,
          competitionGroupName: null,
          leagueId: 7,
          leagueName: 'tLoEG',
        },
      ]);

      expect(await service.listAllWithLeague({})).toEqual([
        {
          id: 3,
          name: 'Legendary Player',
          competitionGroupId: null,
          competitionGroupName: null,
          leagueId: 7,
          leagueName: 'tLoEG',
        },
      ]);
    });
  });

  describe('findAwardRuleCuration', () => {
    it('reads only curated rows that are not soft-removed', async () => {
      const { chains } = await build([], [], []);

      await service.findAwardRuleCuration(1);

      // Included types, excluded types, eligible positions: each read is
      // scoped to the trophy AND to rows still part of the rule.
      expect(chains).toHaveLength(3);
      for (const chain of chains) {
        expect(extractAllFilterValues(firstCallArg(chain.where))).toEqual([
          1,
          false,
        ]);
      }
    });

    it("reads a trophy's curated rule event types, flattened for display", async () => {
      await build(
        [{ actionType: 'foul', consequenceType: null }],
        [{ actionType: 'mvp_award', consequenceType: null }],
        [],
      );

      await expect(service.findAwardRuleCuration(1)).resolves.toEqual({
        includedActionTypes: ['foul'],
        includedConsequenceTypes: [],
        excludedActionTypes: ['mvp award'],
        excludedConsequenceTypes: [],
        eligiblePositions: [],
      });
    });

    it("reduces the curated position ids to the positions' own names", async () => {
      // Bierhallenfuehrer's real restriction. The rows store the
      // `Name`-system id, `"<race>: <position>"`, but a sentence about the
      // rule has to read as prose, so only the position half is displayed.
      await build(
        [],
        [],
        [
          { positionNameExternalId: 'Ogre: Ogre Blocker' },
          { positionNameExternalId: 'Ogre: Ogre Runt Punter' },
        ],
      );

      await expect(service.findAwardRuleCuration(1)).resolves.toEqual({
        includedActionTypes: [],
        includedConsequenceTypes: [],
        excludedActionTypes: [],
        excludedConsequenceTypes: [],
        eligiblePositions: ['Ogre Blocker', 'Ogre Runt Punter'],
      });
    });

    it('keeps action types and consequence types separate for a compound rule', async () => {
      // Top Fouler's real curated rule: a `foul` action that ALSO caused one
      // of these consequences. Flattening both columns into one list would
      // lose exactly the distinction that makes this an AND, not an OR list.
      await build(
        [
          { actionType: 'foul', consequenceType: null },
          { actionType: null, consequenceType: 'casualty' },
          { actionType: null, consequenceType: 'badly_hurt' },
        ],
        [],
        [],
      );

      await expect(service.findAwardRuleCuration(1)).resolves.toEqual({
        includedActionTypes: ['foul'],
        includedConsequenceTypes: ['casualty', 'badly hurt'],
        excludedActionTypes: [],
        excludedConsequenceTypes: [],
        eligiblePositions: [],
      });
    });
  });

  describe('listByLeague', () => {
    it('lists trophies scoped directly to one league, ordered by name', async () => {
      const { chains } = await build([
        { id: 3, name: 'Legendary Player' },
        { id: 4, name: 'Trogen Tjänst' },
      ]);

      const rows = await service.listByLeague(7);

      expect(rows).toEqual([
        { id: 3, name: 'Legendary Player' },
        { id: 4, name: 'Trogen Tjänst' },
      ]);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
      expect(chains[0].orderBy).toHaveBeenCalled();
    });
  });

  describe('scoped counts', () => {
    it('counts every trophy in the catalogue', async () => {
      await build([{ count: 58 }]);

      await expect(service.countAll()).resolves.toBe(58);
    });

    it('counts league-direct trophies together with the trophies of the league groups', async () => {
      const { chains } = await build([{ count: 21 }]);

      await expect(service.countByLeague(9)).resolves.toBe(21);

      // or(eq(competitionGroups.leagueId, 9), eq(trophies.leagueId, 9))
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        9, 9,
      ]);
      expect(
        extractJoinColumns(firstCallArg(chains[0].leftJoin, 0, 1)),
      ).toEqual(['competition_groups.id', 'trophies.competition_group_id']);
    });

    it('counts trophies of the competition groups that run competitions in the era, plus any trophy scoped directly to one of those groups’ leagues', async () => {
      // chains[0] is the outer count query; chains[1] and chains[2] are the
      // two subqueries built for the inArray conditions (groups, then
      // leagues).
      const { chains } = await build([{ count: 12 }], [], []);

      await expect(service.countByEra(5)).resolves.toBe(12);

      expect(chains).toHaveLength(3);
      expect(extractFilterValues(firstCallArg(chains[1].where))).toBe(5);
      expect(extractFilterValues(firstCallArg(chains[2].where))).toBe(5);
      expect(
        extractJoinColumns(firstCallArg(chains[2].innerJoin, 0, 1)),
      ).toEqual(['competition_groups.id', 'competitions.competition_group_id']);
      // or(inArray(trophies.competitionGroupId, ...), inArray(trophies.leagueId, ...))
      expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
        'trophies.competition_group_id',
        'trophies.league_id',
      ]);
      expect(sqlText(firstCallArg(chains[0].where)).toLowerCase()).toContain(
        ' or ',
      );
    });

    it("counts the trophies of the competition's own group, plus any trophy scoped directly to that group's league", async () => {
      // chains[0] is the outer count query; chains[1] and chains[2] are the
      // two subqueries built for the inArray conditions (group, then
      // league).
      const { chains } = await build([{ count: 4 }], [], []);

      await expect(service.countByCompetition(7)).resolves.toBe(4);

      expect(chains).toHaveLength(3);
      expect(extractFilterValues(firstCallArg(chains[1].where))).toBe(7);
      expect(extractFilterValues(firstCallArg(chains[2].where))).toBe(7);
      expect(
        extractJoinColumns(firstCallArg(chains[2].innerJoin, 0, 1)),
      ).toEqual(['competition_groups.id', 'competitions.competition_group_id']);
      expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
        'trophies.competition_group_id',
        'trophies.league_id',
      ]);
      expect(sqlText(firstCallArg(chains[0].where)).toLowerCase()).toContain(
        ' or ',
      );
    });
  });
});
