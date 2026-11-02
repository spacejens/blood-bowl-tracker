import { playerAdvancements, players } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { describe, expect, it } from 'vitest';

import {
  extractAllFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { SkillValidationError } from '../shared/skill-validation-error';
import { makeService } from './player-skills.test-helpers';

const player = { id: 1, grantedSkillId: null };
const ag = {
  playerId: 1,
  source: 'characteristic' as const,
  characteristic: 'AG' as const,
};

/** One stored characteristic row of player 1. */
function storedRow(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    playerId: 1,
    skillId: null,
    characteristic: 'AG',
    source: 'characteristic',
    attributeValue: null,
    advancementOrder: null,
    orderConfirmed: false,
    isFreeExtra: false,
    removed: false,
    ...overrides,
  };
}

/** What an insert of one characteristic row of player 1 returns. */
function insertedRow(id: number, advancementOrder: number | null) {
  return {
    id,
    playerId: 1,
    characteristic: 'AG',
    advancementOrder,
    orderConfirmed: false,
  };
}

describe('PlayerSkillsService.sync characteristic increases', () => {
  it('inserts the increases of a listed player and returns their ids in batch order', async () => {
    const db = mockDb(
      [player],
      [],
      [insertedRow(90, 3), insertedRow(91, null)],
    );
    const service = await makeService(db);

    const result = await service.sync({
      entries: [
        { ...ag, advancementOrder: 3 },
        { ...ag, advancementOrder: null },
      ],
      characteristicPlayerIds: [1],
    });

    expect(result).toEqual({ playerSkillIds: [90, 91] });
    expect(db.db.insert).toHaveBeenCalledWith(playerAdvancements);
    expect(firstCallArg(db.chains[2].values)).toEqual([
      {
        playerId: 1,
        source: 'characteristic',
        characteristic: 'AG',
        advancementOrder: 3,
      },
      {
        playerId: 1,
        source: 'characteristic',
        characteristic: 'AG',
        advancementOrder: null,
      },
    ]);
    expect(db.db.update).toHaveBeenLastCalledWith(players);
  });

  it('hands identical inserted increases their ids in whatever order Postgres returned them', async () => {
    const db = mockDb(
      [player],
      [],
      [insertedRow(91, null), insertedRow(90, null)],
    );
    const service = await makeService(db);

    const result = await service.sync({
      entries: [
        { ...ag, advancementOrder: null },
        { ...ag, advancementOrder: null },
      ],
      characteristicPlayerIds: [1],
    });

    expect([...result.playerSkillIds].sort()).toEqual([90, 91]);
  });

  it('inserts a confirmed increase with its flag', async () => {
    const db = mockDb(
      [player],
      [],
      [{ ...insertedRow(90, 2), orderConfirmed: true }],
    );
    const service = await makeService(db);

    const result = await service.sync({
      entries: [{ ...ag, advancementOrder: 2, orderConfirmed: true }],
      characteristicPlayerIds: [1],
    });

    expect(result).toEqual({ playerSkillIds: [90] });
    expect(firstCallArg(db.chains[2].values)).toEqual([
      {
        playerId: 1,
        source: 'characteristic',
        characteristic: 'AG',
        advancementOrder: 2,
        orderConfirmed: true,
      },
    ]);
  });

  it('issues no skills query and writes nothing for an unchanged list', async () => {
    const db = mockDb([player], [storedRow(90, { advancementOrder: 3 })]);
    const service = await makeService(db);

    const result = await service.sync({
      entries: [{ ...ag, advancementOrder: 3 }],
      characteristicPlayerIds: [1],
    });

    expect(result).toEqual({ playerSkillIds: [90] });
    expect(db.chains[1].from).toHaveBeenCalledWith(playerAdvancements);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('flags a stored increase removed when the listed player now has none', async () => {
    const db = mockDb([player], [storedRow(70)]);
    const service = await makeService(db);

    const result = await service.sync({
      entries: [],
      characteristicPlayerIds: [1],
    });

    expect(result).toEqual({ playerSkillIds: [] });
    expect(firstCallArg(db.chains[2].set)).toEqual({ removed: true });
    expect(extractAllFilterValues(firstCallArg(db.chains[2].where))).toEqual([
      70,
    ]);
    expect(db.db.update).toHaveBeenLastCalledWith(players);
  });

  it('revives a removed increase and returns its id', async () => {
    const db = mockDb([player], [storedRow(70, { removed: true })]);
    const service = await makeService(db);

    const result = await service.sync({
      entries: [{ ...ag, advancementOrder: 4 }],
      characteristicPlayerIds: [1],
    });

    expect(result).toEqual({ playerSkillIds: [70] });
    expect(firstCallArg(db.chains[2].set)).toEqual({
      removed: false,
      advancementOrder: 4,
    });
  });

  it('leaves the increases of a player not listed untouched', async () => {
    const db = mockDb(
      [player],
      [{ id: 7, name: 'Block' }],
      [storedRow(70)],
      [{ id: 51, playerId: 1, skillId: 7, attributeValue: null }],
    );
    const service = await makeService(db);

    await service.sync({
      entries: [{ playerId: 1, skillId: 7, source: 'starting' }],
    });

    expect(db.db.update).not.toHaveBeenCalledWith(playerAdvancements);
  });

  it('appends an increase without an order after the batch and stored orders', async () => {
    const db = mockDb(
      [player],
      [{ id: 7, name: 'Block' }],
      [storedRow(70, { advancementOrder: 2 })],
      [{ id: 51, playerId: 1, skillId: 7, attributeValue: null }],
      [insertedRow(92, 4)],
    );
    const service = await makeService(db);

    const result = await service.sync({
      entries: [
        { playerId: 1, skillId: 7, source: 'chosen', advancementOrder: 3 },
        { ...ag, advancementOrder: 2 },
        { ...ag },
      ],
      characteristicPlayerIds: [1],
    });

    expect(firstCallArg(db.chains[4].values)).toEqual([
      {
        playerId: 1,
        source: 'characteristic',
        characteristic: 'AG',
        advancementOrder: 4,
      },
    ]);
    expect(result).toEqual({ playerSkillIds: [51, 70, 92] });
  });

  it('appends after a removed row without counting its order', async () => {
    const db = mockDb(
      [player],
      [storedRow(70, { removed: true, characteristic: 'MA' })],
      [insertedRow(92, 1)],
    );
    const service = await makeService(db);

    await service.sync({
      entries: [{ ...ag }],
      characteristicPlayerIds: [1],
    });

    expect(firstCallArg(db.chains[2].values)).toEqual([
      {
        playerId: 1,
        source: 'characteristic',
        characteristic: 'AG',
        advancementOrder: 1,
      },
    ]);
  });

  it('rejects an increase for a player missing from characteristicPlayerIds', async () => {
    const db = mockDb([player], []);
    const service = await makeService(db);

    await expect(service.sync({ entries: [{ ...ag }] })).rejects.toThrow(
      SkillValidationError,
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects an unknown player in characteristicPlayerIds', async () => {
    const db = mockDb([], []);
    const service = await makeService(db);

    await expect(
      service.sync({ entries: [], characteristicPlayerIds: [99] }),
    ).rejects.toThrow(SkillValidationError);
  });

  it('rejects a skill entry that names no skill', async () => {
    const db = mockDb([player], []);
    const service = await makeService(db);

    await expect(
      service.sync({ entries: [{ playerId: 1, source: 'chosen' }] }),
    ).rejects.toThrow(SkillValidationError);
  });

  it('throws when the increase insert returns no row', async () => {
    const db = mockDb([player], [], []);
    const service = await makeService(db);

    await expect(
      service.sync({
        entries: [{ ...ag, advancementOrder: 1 }],
        characteristicPlayerIds: [1],
      }),
    ).rejects.toThrow('player_advancements');
  });
});

describe('PlayerSkillsService.sync confirmed skill orders', () => {
  const skill = { id: 7, name: 'Block' };
  const storedSkill = (overrides: Record<string, unknown>) => ({
    id: 40,
    playerId: 1,
    skillId: 7,
    characteristic: null,
    source: 'chosen',
    attributeValue: null,
    advancementOrder: 2,
    orderConfirmed: false,
    isFreeExtra: false,
    removed: false,
    ...overrides,
  });

  it('never overwrites a confirmed skill order with an unconfirmed one', async () => {
    const db = mockDb(
      [player],
      [skill],
      [storedSkill({ advancementOrder: 4, orderConfirmed: true })],
    );
    const service = await makeService(db);

    await service.sync({
      entries: [
        { playerId: 1, skillId: 7, source: 'chosen', advancementOrder: 2 },
      ],
    });

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('confirms a stored skill order', async () => {
    const db = mockDb([player], [skill], [storedSkill({})]);
    const service = await makeService(db);

    await service.sync({
      entries: [
        {
          playerId: 1,
          skillId: 7,
          source: 'chosen',
          advancementOrder: 5,
          orderConfirmed: true,
        },
      ],
    });

    expect(firstCallArg(db.chains[3].set)).toEqual({
      advancementOrder: 5,
      orderConfirmed: true,
    });
  });

  it('replaces a confirmed skill order with another confirmed one', async () => {
    const db = mockDb(
      [player],
      [skill],
      [storedSkill({ advancementOrder: 4, orderConfirmed: true })],
    );
    const service = await makeService(db);

    await service.sync({
      entries: [
        {
          playerId: 1,
          skillId: 7,
          source: 'chosen',
          advancementOrder: 5,
          orderConfirmed: true,
        },
      ],
    });

    expect(firstCallArg(db.chains[3].set)).toEqual({ advancementOrder: 5 });
  });

  it('clears the confirmation along with the order of a skill now starting', async () => {
    const db = mockDb(
      [player],
      [skill],
      [storedSkill({ advancementOrder: 4, orderConfirmed: true })],
    );
    const service = await makeService(db);

    await service.sync({
      entries: [{ playerId: 1, skillId: 7, source: 'starting' }],
    });

    expect(firstCallArg(db.chains[3].set)).toEqual({
      source: 'starting',
      advancementOrder: null,
      orderConfirmed: false,
    });
  });

  it('inserts a confirmed skill with its flag', async () => {
    const db = mockDb(
      [player],
      [skill],
      [],
      [{ id: 41, playerId: 1, skillId: 7, attributeValue: null }],
    );
    const service = await makeService(db);

    await service.sync({
      entries: [
        {
          playerId: 1,
          skillId: 7,
          source: 'chosen',
          advancementOrder: 5,
          orderConfirmed: true,
        },
      ],
    });

    expect(firstCallArg(db.chains[3].values)).toEqual([
      {
        playerId: 1,
        skillId: 7,
        source: 'chosen',
        attributeValue: null,
        advancementOrder: 5,
        orderConfirmed: true,
      },
    ]);
  });
});
