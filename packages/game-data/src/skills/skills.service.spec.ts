import type { Db } from '@blood-bowl-tracker/db';
import { DB, skills } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { FACT_SCOPE_ALL_TIME } from '../shared/fact-scope';
import {
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
  sqlText,
} from '../shared/query-assertions.test-helpers';
import { SkillsService, SkillUpsertConflictError } from './skills.service';

const fakeSkill = {
  id: 7,
  name: 'Block',
  createdAt: new Date('2026-01-01'),
};

const data = {
  name: 'Block',
  externalIds: [
    { externalSystemId: 1, externalId: '3' },
    { externalSystemId: 2, externalId: 'Name: Block' },
  ],
};

describe('SkillsService', () => {
  let service: SkillsService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [SkillsService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(SkillsService);
    return { db, chains };
  }

  it('creates a new skill when no external IDs match', async () => {
    // query 0: external-id lookup finds nothing; query 1: the insert returns
    // the row; query 2: both external IDs are new, so they get inserted.
    const { db, chains } = await build([], [fakeSkill]);

    const result = await service.upsert(data);

    expect(result).toEqual({ skill: fakeSkill, created: true });
    expect(chains).toHaveLength(3);
    expect(db.insert).toHaveBeenCalledWith(skills);
    expect(db.update).not.toHaveBeenCalled();
    expect(firstCallArg(chains[1].values)).toEqual({ name: 'Block' });
  });

  it('updates the matched skill when one external ID already exists', async () => {
    // query 0: the lookup matches one owner; query 1: the update returns the
    // row; query 2: the still-missing external ID is inserted.
    const { db } = await build(
      [{ ownerId: 7, externalSystemId: 1, externalId: '3' }],
      [{ ...fakeSkill, name: 'Block!' }],
    );

    const result = await service.upsert({ ...data, name: 'Block!' });

    expect(result.created).toBe(false);
    expect(result.skill.name).toBe('Block!');
    expect(db.update).toHaveBeenCalledWith(skills);
  });

  it('rejects an upsert whose external IDs name two different skills', async () => {
    const { db } = await build([
      { ownerId: 7, externalSystemId: 1, externalId: '3' },
      { ownerId: 8, externalSystemId: 2, externalId: 'Name: Block' },
    ]);

    await expect(service.upsert(data)).rejects.toBeInstanceOf(
      SkillUpsertConflictError,
    );
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('names the entity in the conflict message', async () => {
    await build([
      { ownerId: 7, externalSystemId: 1, externalId: '3' },
      { ownerId: 8, externalSystemId: 2, externalId: 'Name: Block' },
    ]);

    await expect(service.upsert(data)).rejects.toThrow(/skills/);
  });

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

      // The only literal in the WHERE tree is positions.is_star_player = false:
      // "any" deliberately spans all four sources, so it adds no source filter.
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        false,
      ]);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('counts distinct players per skill, grouped by skill id and name so attribute variants collapse', async () => {
      const { chains } = await build(rows);

      await service.countPlayersBySkillAny(FACT_SCOPE_ALL_TIME, 21);

      // Grouping deliberately omits playerSkills.attributeValue, and the count
      // is distinct players, so one player holding Hatred (Elf) and Hatred
      // (Dwarf) contributes 1 to Hatred rather than 2.
      expect(chains[0].groupBy).toHaveBeenCalledWith(skills.id, skills.name);
    });

    it('joins players to positions so star players can be excluded', async () => {
      const { chains } = await build(rows);

      await service.countPlayersBySkillAny(FACT_SCOPE_ALL_TIME, 21);

      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['skills.id', 'player_skills.skill_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['players.id', 'player_skills.player_id']);
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
      ]);
    });

    it('filters by league through the eras join', async () => {
      const { chains } = await build(rows);

      await service.countPlayersBySkillAny({ leagueId: 9 }, 21);

      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
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
