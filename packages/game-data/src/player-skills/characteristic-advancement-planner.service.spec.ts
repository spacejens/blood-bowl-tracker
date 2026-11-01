import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  IncomingCharacteristicEntry,
  StoredCharacteristicRow,
} from './characteristic-advancement-planner.service';
import { CharacteristicAdvancementPlannerService } from './characteristic-advancement-planner.service';

function stored(
  overrides: Partial<StoredCharacteristicRow> & { id: number },
): StoredCharacteristicRow {
  return {
    characteristic: 'AG',
    advancementOrder: null,
    orderConfirmed: false,
    removed: false,
    ...overrides,
  };
}

function incoming(
  overrides: Partial<IncomingCharacteristicEntry> & { index: number },
): IncomingCharacteristicEntry {
  return {
    characteristic: 'AG',
    advancementOrder: null,
    orderConfirmed: false,
    ...overrides,
  };
}

describe('CharacteristicAdvancementPlannerService', () => {
  let planner: CharacteristicAdvancementPlannerService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CharacteristicAdvancementPlannerService],
    }).compile();
    planner = moduleRef.get(CharacteristicAdvancementPlannerService);
  });

  it('inserts every entry when nothing is stored', () => {
    const plan = planner.plan({
      stored: [],
      incoming: [
        incoming({ index: 0, advancementOrder: 3 }),
        incoming({ index: 1, advancementOrder: null }),
      ],
      highestOrder: 5,
    });
    expect(plan.inserts).toEqual([
      {
        index: 0,
        characteristic: 'AG',
        advancementOrder: 3,
        orderConfirmed: false,
      },
      {
        index: 1,
        characteristic: 'AG',
        advancementOrder: null,
        orderConfirmed: false,
      },
    ]);
    expect(plan.updates).toEqual([]);
  });

  it('appends entries without an order after the highest order, characteristics in stat-line order', () => {
    const plan = planner.plan({
      stored: [],
      incoming: [
        incoming({
          index: 0,
          characteristic: 'AV',
          advancementOrder: undefined,
        }),
        incoming({
          index: 1,
          characteristic: 'MA',
          advancementOrder: undefined,
        }),
      ],
      highestOrder: 4,
    });
    expect(
      plan.inserts.map((row) => [row.index, row.advancementOrder]),
    ).toEqual([
      [1, 5],
      [0, 6],
    ]);
  });

  it('keeps a stored row unchanged when the entry matches it', () => {
    const plan = planner.plan({
      stored: [stored({ id: 10, advancementOrder: 2 })],
      incoming: [incoming({ index: 0, advancementOrder: 2 })],
      highestOrder: 2,
    });
    expect(plan).toEqual({
      updates: [],
      inserts: [],
      existingIdsByIndex: new Map([[0, 10]]),
    });
  });

  it('replaces an unconfirmed stored order with the incoming one, null included', () => {
    const plan = planner.plan({
      stored: [stored({ id: 10, advancementOrder: 2 })],
      incoming: [incoming({ index: 0, advancementOrder: null })],
      highestOrder: 2,
    });
    expect(plan.updates).toEqual([
      { id: 10, values: { advancementOrder: null } },
    ]);
  });

  it('leaves a stored order alone when the entry gives none', () => {
    const plan = planner.plan({
      stored: [stored({ id: 10, advancementOrder: 2 })],
      incoming: [incoming({ index: 0, advancementOrder: undefined })],
      highestOrder: 2,
    });
    expect(plan.updates).toEqual([]);
  });

  it('never overwrites a confirmed order with an unconfirmed entry', () => {
    const plan = planner.plan({
      stored: [stored({ id: 10, advancementOrder: 4, orderConfirmed: true })],
      incoming: [incoming({ index: 0, advancementOrder: 1 })],
      highestOrder: 4,
    });
    expect(plan.updates).toEqual([]);
    expect(plan.existingIdsByIndex.get(0)).toBe(10);
  });

  it('confirms a stored row when the entry is confirmed', () => {
    const plan = planner.plan({
      stored: [stored({ id: 10, advancementOrder: 2 })],
      incoming: [
        incoming({ index: 0, advancementOrder: 3, orderConfirmed: true }),
      ],
      highestOrder: 3,
    });
    expect(plan.updates).toEqual([
      { id: 10, values: { advancementOrder: 3, orderConfirmed: true } },
    ]);
  });

  it('pairs a confirmed entry with the best-ranked stored row', () => {
    const plan = planner.plan({
      stored: [
        stored({ id: 10, advancementOrder: null }),
        stored({ id: 11, advancementOrder: 2 }),
      ],
      incoming: [
        incoming({ index: 0, advancementOrder: 2 }),
        incoming({ index: 1, advancementOrder: 7, orderConfirmed: true }),
      ],
      highestOrder: 7,
    });
    expect(plan.existingIdsByIndex).toEqual(
      new Map([
        [1, 11],
        [0, 10],
      ]),
    );
    expect(plan.updates).toEqual([
      { id: 11, values: { advancementOrder: 7, orderConfirmed: true } },
      { id: 10, values: { advancementOrder: 2 } },
    ]);
  });

  it('flags surplus stored rows removed, worst-ranked ones, clearing their order', () => {
    const plan = planner.plan({
      stored: [
        stored({ id: 10, advancementOrder: null }),
        stored({ id: 11, advancementOrder: 3, orderConfirmed: true }),
        stored({ id: 12, advancementOrder: 5 }),
      ],
      incoming: [
        incoming({ index: 0, advancementOrder: 3, orderConfirmed: true }),
      ],
      highestOrder: 5,
    });
    expect(plan.updates).toEqual([
      { id: 12, values: { removed: true, advancementOrder: null } },
      { id: 10, values: { removed: true } },
    ]);
    expect(plan.existingIdsByIndex.get(0)).toBe(11);
  });

  it('flags every stored row removed when the entries list none', () => {
    const plan = planner.plan({
      stored: [stored({ id: 10, advancementOrder: 4, orderConfirmed: true })],
      incoming: [],
      highestOrder: 4,
    });
    expect(plan.updates).toEqual([
      {
        id: 10,
        values: {
          removed: true,
          advancementOrder: null,
          orderConfirmed: false,
        },
      },
    ]);
  });

  it('revives a removed row before inserting a new one', () => {
    const plan = planner.plan({
      stored: [stored({ id: 10, removed: true })],
      incoming: [
        incoming({ index: 0, advancementOrder: 6, orderConfirmed: true }),
        incoming({ index: 1, advancementOrder: null }),
      ],
      highestOrder: 6,
    });
    expect(plan.updates).toEqual([
      {
        id: 10,
        values: { removed: false, advancementOrder: 6, orderConfirmed: true },
      },
    ]);
    expect(plan.inserts).toEqual([
      {
        index: 1,
        characteristic: 'AG',
        advancementOrder: null,
        orderConfirmed: false,
      },
    ]);
  });

  it('revives a removed row with an unknown order without touching its order', () => {
    const plan = planner.plan({
      stored: [stored({ id: 10, removed: true })],
      incoming: [incoming({ index: 0, advancementOrder: null })],
      highestOrder: 0,
    });
    expect(plan.updates).toEqual([{ id: 10, values: { removed: false } }]);
  });

  it('clears a stale order and confirmation on a revived row', () => {
    const plan = planner.plan({
      stored: [
        stored({
          id: 10,
          removed: true,
          advancementOrder: 3,
          orderConfirmed: true,
        }),
      ],
      incoming: [incoming({ index: 0, advancementOrder: null })],
      highestOrder: 0,
    });
    expect(plan.updates).toEqual([
      {
        id: 10,
        values: {
          removed: false,
          advancementOrder: null,
          orderConfirmed: false,
        },
      },
    ]);
  });

  it('plans each characteristic on its own', () => {
    const plan = planner.plan({
      stored: [stored({ id: 10, characteristic: 'MA', advancementOrder: 1 })],
      incoming: [
        incoming({ index: 0, characteristic: 'AG', advancementOrder: 2 }),
      ],
      highestOrder: 2,
    });
    expect(plan.updates).toEqual([
      { id: 10, values: { removed: true, advancementOrder: null } },
    ]);
    expect(plan.inserts.map((row) => row.characteristic)).toEqual(['AG']);
  });
});
