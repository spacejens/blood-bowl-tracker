import type { Db } from '@blood-bowl-tracker/db';
import { DB, skills } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import {
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
  mockDb,
  sqlText,
} from '@blood-bowl-tracker/db/test-helpers';
import { FACT_SCOPE_ALL_TIME } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { SkillsQueriesService } from './skills-queries.service';

describe('SkillsQueriesService', () => {
  let service: SkillsQueriesService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [SkillsQueriesService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(SkillsQueriesService);
    return { db, chains };
  }

  describe('skill popularity toplists', () => {
    const rows = [
      { skillId: 1, name: 'Block', count: 120 },
      { skillId: 2, name: 'Dodge', count: 95 },
    ];

    it('countPlayersBySkillAny returns the rows the query resolves to', async () => {
      const { db } = await build(rows);

      await expect(
        service.countPlayersBySkillAny(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);

      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('countPlayersBySkillAny applies no source filter, only the star-player exclusion', async () => {
      const { chains } = await build(rows);

      await service.countPlayersBySkillAny(FACT_SCOPE_ALL_TIME, 21);

      // The literals are removed = false (a retired starting Loner is left
      // out) and positions.is_star_player = false: "any" deliberately spans all
      // four sources, so it adds no source filter.
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        false,
        false,
      ]);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('counts distinct players per skill, grouped by skill id and name so attribute variants collapse', async () => {
      const { chains } = await build(rows);

      await service.countPlayersBySkillAny(FACT_SCOPE_ALL_TIME, 21);

      // Grouping deliberately omits playerAdvancements.attributeValue, and the count
      // is distinct players, so one player holding Hatred (Elf) and Hatred
      // (Dwarf) contributes 1 to Hatred rather than 2.
      expect(chains[0].groupBy).toHaveBeenCalledWith(skills.id, skills.name);
    });

    it('joins players to positions so star players can be excluded', async () => {
      const { chains } = await build(rows);

      await service.countPlayersBySkillAny(FACT_SCOPE_ALL_TIME, 21);

      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['skills.id', 'player_advancements.skill_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['players.id', 'player_advancements.player_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 2, 1)),
      ).toEqual(['positions.id', 'players.position_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 3, 1)),
      ).toEqual(['team_eras.id', 'players.team_era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 4, 1)),
      ).toEqual(['eras.id', 'team_eras.era_id']);
    });

    it('countPlayersBySkillAdvancement excludes starting skills but keeps the ambiguous advancement source', async () => {
      const { chains } = await build(rows);

      await expect(
        service.countPlayersBySkillAdvancement(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);

      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'advancement',
        'chosen',
        'random',
        false,
        false,
      ]);
    });

    it('countPlayersBySkillChosen filters to the chosen source alone', async () => {
      const { chains } = await build(rows);

      await expect(
        service.countPlayersBySkillChosen(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);

      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'chosen',
        false,
        false,
      ]);
    });

    it('countPlayersBySkillRandom filters to the random source alone', async () => {
      const { chains } = await build(rows);

      await expect(
        service.countPlayersBySkillRandom(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);

      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'random',
        false,
        false,
      ]);
    });

    it('filters by league through the eras join', async () => {
      const { chains } = await build(rows);

      await service.countPlayersBySkillAny({ leagueId: 9 }, 21);

      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        false,
        false,
        9,
      ]);
    });

    it('filters by era through the team era', async () => {
      const { chains } = await build(rows);

      await service.countPlayersBySkillChosen({ eraId: 20 }, 21);

      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'chosen',
        false,
        false,
        20,
      ]);
    });

    it('ranks by descending count and breaks ties on the skill name so the list is deterministic', async () => {
      const { chains } = await build(rows);

      await service.countPlayersBySkillAny(FACT_SCOPE_ALL_TIME, 21);

      const orderBy = (
        chains[0].orderBy as unknown as { mock: { calls: unknown[][] } }
      ).mock.calls[0];
      expect(sqlText(orderBy[0])).toContain(' desc');
      expect(sqlText(orderBy[1])).toContain(' asc');
    });
  });

  describe('countAll', () => {
    it('counts every skill in the catalogue', async () => {
      await build([{ count: 412 }]);

      await expect(service.countAll()).resolves.toBe(412);
    });
  });

  describe('scoped catalogue counts', () => {
    it('counts distinct skills defined under the rules sets an era uses', async () => {
      const { chains } = await build([{ count: 37 }]);

      await expect(service.countByEra(5)).resolves.toBe(37);

      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(5);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual([
        'era_rules_sets.rules_set_id',
        'skill_rules_sets.rules_set_id',
      ]);
    });

    it('counts distinct skills across every era of a league', async () => {
      const { chains } = await build([{ count: 61 }]);

      await expect(service.countByLeague(9)).resolves.toBe(61);

      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['eras.id', 'era_rules_sets.era_id']);
    });

    it("counts skills through the competition's own era, filtered by competition id", async () => {
      const { chains } = await build([{ count: 37 }]);

      await expect(service.countByCompetition(7)).resolves.toBe(37);

      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['competitions.era_id', 'era_rules_sets.era_id']);
    });
  });
});
