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
    unspentSpp: 7,
    isStarPlayer: false,
    eraId: 3,
    leagueId: 5,
    positionId: 8,
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
    orderConfirmed: false,
    isFreeExtra: false,
  },
  {
    playerId: 42,
    skillId: 11,
    skillName: 'Guard',
    source: 'chosen',
    advancementOrder: 2,
    orderConfirmed: false,
    isFreeExtra: true,
  },
  {
    playerId: 42,
    skillId: 12,
    skillName: 'Block',
    source: 'starting',
    advancementOrder: null,
    orderConfirmed: false,
    isFreeExtra: false,
  },
];
const INCREASES = [
  {
    playerId: 42,
    characteristic: 'AG',
    advancementOrder: 3,
    orderConfirmed: true,
  },
  {
    playerId: 42,
    characteristic: 'MA',
    advancementOrder: null,
    orderConfirmed: false,
  },
];
/** Position 8's categories: BB2016's primary and secondary, CRP's primary. */
const POSITION_CATEGORIES = [
  { positionId: 8, rulesSetId: 2, category: 'general', access: 'primary' },
  { positionId: 8, rulesSetId: 2, category: 'agility', access: 'primary' },
  { positionId: 8, rulesSetId: 2, category: 'strength', access: 'secondary' },
  { positionId: 8, rulesSetId: 1, category: 'passing', access: 'primary' },
];
/** Guard is unlisted under BB2016; Dodge has another category under CRP. */
const SKILL_CATEGORIES = [
  { skillId: 10, rulesSetId: 2, category: 'agility' },
  { skillId: 10, rulesSetId: 1, category: 'general' },
  { skillId: 12, rulesSetId: 2, category: 'general' },
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
  it("assembles one player's history from seven queries", async () => {
    const dbResult = mockDb(
      ERA_RULES_SETS,
      COSTS,
      [playerRow()],
      SKILLS,
      INCREASES,
      POSITION_CATEGORIES,
      SKILL_CATEGORIES,
    );
    const service = await makeService(dbResult);

    const history = (await service.forPlayers([42])).get(42);

    expect(history).toEqual({
      playerId: 42,
      sppTotal: 40,
      storedUnspentSpp: 7,
      isStarPlayer: false,
      rulesSet: { id: 2, name: 'BB2016' },
      skills: [
        {
          skillId: 12,
          skillName: 'Block',
          source: 'starting',
          advancementOrder: null,
          orderConfirmed: false,
          isFreeExtra: false,
          category: 'general',
        },
        {
          skillId: 10,
          skillName: 'Dodge',
          source: 'random',
          advancementOrder: 1,
          orderConfirmed: false,
          isFreeExtra: false,
          category: 'agility',
        },
        {
          skillId: 11,
          skillName: 'Guard',
          source: 'chosen',
          advancementOrder: 2,
          orderConfirmed: false,
          isFreeExtra: true,
          category: null,
        },
      ],
      primaryCategories: new Set(['general', 'agility']),
      secondaryCategories: new Set(['strength']),
      increases: [
        { characteristic: 'AG', advancementOrder: 3, orderConfirmed: true },
        { characteristic: 'MA', advancementOrder: null, orderConfirmed: false },
      ],
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
    expect(dbResult.chains).toHaveLength(7);
  });

  it('ignores a stored row that names no skill', async () => {
    const dbResult = mockDb(
      ERA_RULES_SETS,
      COSTS,
      [playerRow()],
      [
        ...SKILLS,
        {
          playerId: 42,
          skillId: null,
          skillName: 'Unnamed',
          source: 'characteristic',
          advancementOrder: 3,
          orderConfirmed: false,
          isFreeExtra: false,
        },
      ],
      INCREASES,
      POSITION_CATEGORIES,
      SKILL_CATEGORIES,
    );
    const service = await makeService(dbResult);

    const history = (await service.forPlayers([42])).get(42);

    expect(history?.skills.map((skill) => skill.skillName)).toEqual([
      'Block',
      'Dodge',
      'Guard',
    ]);
  });

  it('gives an era with no rules set no rules set and no costs', async () => {
    const dbResult = mockDb(
      ERA_RULES_SETS,
      COSTS,
      [playerRow({ eraId: 4 })],
      SKILLS,
      INCREASES,
      POSITION_CATEGORIES,
      SKILL_CATEGORIES,
    );
    const service = await makeService(dbResult);

    const history = (await service.forPlayers([42])).get(42);

    expect(history?.rulesSet).toBeNull();
    expect(history?.costs).toEqual([]);
    expect(history?.skills.map((skill) => skill.category)).toEqual([
      null,
      null,
      null,
    ]);
    expect(history?.primaryCategories).toEqual(new Set());
    expect(history?.secondaryCategories).toEqual(new Set());
  });

  it('takes the categories of the rules set the era resolves to', async () => {
    const dbResult = mockDb(
      [{ eraId: 3, id: 1, name: 'CRP' }],
      COSTS,
      [playerRow()],
      SKILLS,
      INCREASES,
      POSITION_CATEGORIES,
      SKILL_CATEGORIES,
    );
    const service = await makeService(dbResult);

    const history = (await service.forPlayers([42])).get(42);

    expect(history?.primaryCategories).toEqual(new Set(['passing']));
    expect(history?.secondaryCategories).toEqual(new Set());
    expect(history?.skills.map((skill) => skill.category)).toEqual([
      null,
      'general',
      null,
    ]);
  });

  it('skips the skill category query when no player has a skill', async () => {
    const dbResult = mockDb(
      ERA_RULES_SETS,
      COSTS,
      [playerRow()],
      [],
      [],
      POSITION_CATEGORIES,
    );
    const service = await makeService(dbResult);

    const history = (await service.forPlayers([42])).get(42);

    expect(history?.skills).toEqual([]);
    expect(history?.primaryCategories).toEqual(new Set(['general', 'agility']));
    expect(dbResult.chains).toHaveLength(6);
  });

  it('gives a player without increase rows no increases', async () => {
    const service = await makeService(
      mockDb(ERA_RULES_SETS, COSTS, [playerRow()], SKILLS, [], [], []),
    );

    const history = (await service.forPlayers([42])).get(42);

    expect(history?.increases).toEqual([]);
  });

  it('keeps each increase row on its own player', async () => {
    const service = await makeService(
      mockDb(
        ERA_RULES_SETS,
        COSTS,
        [playerRow(), playerRow({ playerId: 43 })],
        [],
        [{ ...INCREASES[0], playerId: 43 }],
        [],
      ),
    );

    const histories = await service.forPlayers([42, 43]);

    expect(histories.get(42)?.increases).toEqual([]);
    expect(histories.get(43)?.increases).toEqual([
      { characteristic: 'AG', advancementOrder: 3, orderConfirmed: true },
    ]);
  });

  it('issues no query for an empty batch', async () => {
    const dbResult = mockDb();
    const service = await makeService(dbResult);

    expect(await service.forPlayers([])).toEqual(new Map());
    expect(dbResult.chains).toHaveLength(0);
  });

  it('skips the skill queries when no player matched', async () => {
    const dbResult = mockDb(ERA_RULES_SETS, COSTS, []);
    const service = await makeService(dbResult);

    expect(await service.forPlayers([42])).toEqual(new Map());
    expect(dbResult.chains).toHaveLength(3);
  });

  it('loads the rules sets and costs once per process', async () => {
    const dbResult = mockDb(ERA_RULES_SETS, COSTS, [], [], []);
    const service = await makeService(dbResult);

    await service.forPlayers([42]);
    await service.forPlayers([43]);

    expect(dbResult.chains).toHaveLength(4);
  });

  it('queries players in chunks of 1000 ids', async () => {
    const dbResult = mockDb(ERA_RULES_SETS, COSTS, [], [], []);
    const service = await makeService(dbResult);

    await service.forPlayers(Array.from({ length: 1001 }, (_, i) => i + 1));

    expect(dbResult.chains).toHaveLength(4);
  });

  it('keeps only the league rows of the player league', async () => {
    const service = await makeService(
      mockDb(
        ERA_RULES_SETS,
        COSTS,
        [playerRow({ leagueId: 6 })],
        [],
        [],
        [],
        [],
      ),
    );

    const history = (await service.forPlayers([42])).get(42);

    expect(history?.costs.map((cost) => cost.leagueId)).toEqual([null, 6]);
  });
});
