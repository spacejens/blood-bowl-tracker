import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { PlayerAdvancementHistoryService } from './player-advancement-history.service';

const ERA_RULES_SETS = [
  { eraId: 3, id: 1, name: 'CRP' },
  { eraId: 3, id: 2, name: 'BB2016' },
];
const COSTS = [
  {
    rulesSetId: 2,
    leagueId: null,
    advancementNumber: 1,
    advancementKind: 'table_roll',
    skillId: null,
    sppCost: 6,
  },
  {
    rulesSetId: 2,
    leagueId: 5,
    advancementNumber: 7,
    advancementKind: 'granted_skill',
    skillId: 99,
    sppCost: 125,
  },
  {
    rulesSetId: 2,
    leagueId: 6,
    advancementNumber: 7,
    advancementKind: 'granted_skill',
    skillId: 98,
    sppCost: 1,
  },
  {
    rulesSetId: 1,
    leagueId: null,
    advancementNumber: 1,
    advancementKind: 'table_roll',
    skillId: null,
    sppCost: 7,
  },
];

function playerRow(overrides: Record<string, unknown> = {}) {
  return {
    playerId: 42,
    sppTotal: 40,
    isStarPlayer: false,
    eraId: 3,
    leagueId: 5,
    move: 1,
    strength: 0,
    agility: 0,
    passing: 0,
    armour: 2,
    ...overrides,
  };
}

const SKILLS = [
  {
    playerId: 42,
    skillId: 10,
    skillName: 'Dodge',
    source: 'random',
    advancementOrder: 1,
  },
  {
    playerId: 42,
    skillId: 11,
    skillName: 'Guard',
    source: 'chosen',
    advancementOrder: 2,
  },
  {
    playerId: 42,
    skillId: 12,
    skillName: 'Block',
    source: 'starting',
    advancementOrder: null,
  },
];
const TROPHIES = [
  { playerId: 42, skillId: 11 },
  { playerId: null, skillId: 13 },
];

async function makeService(
  dbResult: MockDbResult,
): Promise<PlayerAdvancementHistoryService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerAdvancementHistoryService,
      { provide: DB, useValue: dbResult.db },
    ],
  }).compile();
  return moduleRef.get(PlayerAdvancementHistoryService);
}

describe('PlayerAdvancementHistoryService', () => {
  it("assembles one player's history from five queries", async () => {
    const dbResult = mockDb(
      ERA_RULES_SETS,
      COSTS,
      [playerRow()],
      SKILLS,
      TROPHIES,
    );
    const service = await makeService(dbResult);

    const history = (await service.forPlayers([42])).get(42);

    expect(history).toEqual({
      playerId: 42,
      sppTotal: 40,
      isStarPlayer: false,
      rulesSet: { id: 2, name: 'BB2016' },
      skills: [
        {
          skillId: 12,
          skillName: 'Block',
          source: 'starting',
          advancementOrder: null,
        },
        {
          skillId: 10,
          skillName: 'Dodge',
          source: 'random',
          advancementOrder: 1,
        },
        {
          skillId: 11,
          skillName: 'Guard',
          source: 'chosen',
          advancementOrder: 2,
        },
      ],
      trophyGrantedSkillIds: new Set([11]),
      increaseCounts: {
        move: 1,
        strength: 0,
        agility: 0,
        passing: 0,
        armour: 2,
      },
      costs: [
        {
          advancementNumber: 1,
          advancementKind: 'table_roll',
          skillId: null,
          sppCost: 6,
          leagueId: null,
        },
        {
          advancementNumber: 7,
          advancementKind: 'granted_skill',
          skillId: 99,
          sppCost: 125,
          leagueId: 5,
        },
      ],
    });
    expect(dbResult.chains).toHaveLength(5);
  });

  it('gives an era with no rules set no rules set and no costs', async () => {
    const service = await makeService(
      mockDb(ERA_RULES_SETS, COSTS, [playerRow({ eraId: 4 })], [], []),
    );

    const history = (await service.forPlayers([42])).get(42);

    expect(history?.rulesSet).toBeNull();
    expect(history?.costs).toEqual([]);
    expect(history?.skills).toEqual([]);
    expect(history?.trophyGrantedSkillIds).toEqual(new Set());
  });

  it('issues no query for an empty batch', async () => {
    const dbResult = mockDb();
    const service = await makeService(dbResult);

    expect(await service.forPlayers([])).toEqual(new Map());
    expect(dbResult.chains).toHaveLength(0);
  });

  it('skips the skill and trophy queries when no player matched', async () => {
    const dbResult = mockDb(ERA_RULES_SETS, COSTS, []);
    const service = await makeService(dbResult);

    expect(await service.forPlayers([42])).toEqual(new Map());
    expect(dbResult.chains).toHaveLength(3);
  });

  it('loads the rules sets and costs once per process', async () => {
    const dbResult = mockDb(ERA_RULES_SETS, COSTS, [], []);
    const service = await makeService(dbResult);

    await service.forPlayers([42]);
    await service.forPlayers([43]);

    expect(dbResult.chains).toHaveLength(4);
  });

  it('queries players in chunks of 1000 ids', async () => {
    const dbResult = mockDb(ERA_RULES_SETS, COSTS, [], []);
    const service = await makeService(dbResult);

    await service.forPlayers(Array.from({ length: 1001 }, (_, i) => i + 1));

    expect(dbResult.chains).toHaveLength(4);
  });

  it('keeps only the league rows of the player league', async () => {
    const service = await makeService(
      mockDb(ERA_RULES_SETS, COSTS, [playerRow({ leagueId: 6 })], [], []),
    );

    const history = (await service.forPlayers([42])).get(42);

    expect(history?.costs.map((cost) => cost.leagueId)).toEqual([null, 6]);
  });
});
