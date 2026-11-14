import type { FillIncompletePlayer } from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  PlannedFillRow,
  StoredFillFields,
  StoredFillRow,
} from './player-fill.types';
import { PlayerFillComparisonService } from './player-fill-comparison.service';

const data: FillIncompletePlayer = {
  playerId: 9,
  status: 'active',
  characteristics: { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 },
  sppTotal: 8,
  unspentSpp: 2,
  startingSkills: [{ skillId: 70, attributeValue: null }],
  advancements: [
    {
      kind: 'skill',
      skillId: 71,
      attributeValue: null,
      source: 'chosen',
      isFreeExtra: false,
    },
  ],
};

const planned: PlannedFillRow[] = [
  {
    skillId: 70,
    characteristic: null,
    attributeValue: null,
    source: 'starting',
    isFreeExtra: false,
    paidNumber: null,
  },
  {
    skillId: 71,
    characteristic: null,
    attributeValue: null,
    source: 'chosen',
    isFreeExtra: false,
    paidNumber: 1,
  },
];

const blank: StoredFillFields = {
  move: 0,
  strength: 0,
  agility: 0,
  passing: null,
  armour: 0,
  sppTotal: null,
  sppAdjustment: null,
  unspentSpp: null,
  status: null,
};

const filled: StoredFillFields = {
  move: 6,
  strength: 3,
  agility: 3,
  passing: 4,
  armour: 9,
  sppTotal: 8,
  sppAdjustment: 8,
  unspentSpp: 2,
  status: 'active',
};

const stored = (overrides: Partial<StoredFillRow> = {}): StoredFillRow => ({
  skillId: 71,
  characteristic: null,
  attributeValue: null,
  source: 'chosen',
  isFreeExtra: false,
  advancementOrder: 1,
  orderConfirmed: true,
  ...overrides,
});

const startingRow = stored({
  skillId: 70,
  source: 'starting',
  advancementOrder: null,
  orderConfirmed: false,
});

describe('PlayerFillComparisonService', () => {
  let service: PlayerFillComparisonService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PlayerFillComparisonService],
    }).compile();
    service = moduleRef.get(PlayerFillComparisonService);
  });

  it('finds nothing to contradict for a blank player, who is not identical', () => {
    expect(service.compare({ fields: blank, rows: [], data, planned })).toEqual(
      { contradictions: [], identical: false },
    );
  });

  it('finds a player stored exactly as the fill leaves him identical', () => {
    expect(
      service.compare({
        fields: filled,
        rows: [startingRow, stored()],
        data,
        planned,
      }),
    ).toEqual({ contradictions: [], identical: true });
  });

  it('reports each stored field that disagrees', () => {
    const { contradictions } = service.compare({
      fields: {
        ...blank,
        move: 5,
        passing: 3,
        sppTotal: 9,
        unspentSpp: 1,
        status: 'dead',
      },
      rows: [],
      data,
      planned,
    });

    expect(contradictions).toEqual([
      'stored MA 5, the entry says 6',
      'stored PA 3, the entry says 4',
      'stored total SPP 9, the entry says 8',
      'stored unspent SPP 1, the entry says 2',
      'stored status dead, the entry says active',
    ]);
  });

  it('reports a stored row the entry does not have', () => {
    const { contradictions } = service.compare({
      fields: blank,
      rows: [stored({ skillId: 99, orderConfirmed: false })],
      data,
      planned,
    });

    expect(contradictions).toEqual(['skill 99 is stored but not in the entry']);
  });

  it('never matches a stored starting skill to a gained one', () => {
    const { contradictions } = service.compare({
      fields: blank,
      rows: [
        stored({
          skillId: 71,
          source: 'starting',
          orderConfirmed: false,
          advancementOrder: null,
        }),
      ],
      data,
      planned,
    });

    expect(contradictions).toEqual([
      'starting skill 71 is stored but not in the entry',
    ]);
  });

  it('reports a random skill the entry calls chosen', () => {
    const { contradictions } = service.compare({
      fields: blank,
      rows: [stored({ source: 'random', orderConfirmed: false })],
      data,
      planned,
    });

    expect(contradictions).toEqual([
      'skill 71 is stored as random, the entry says chosen',
    ]);
  });

  it('reports a confirmed number the entry changes', () => {
    const { contradictions } = service.compare({
      fields: blank,
      rows: [stored({ advancementOrder: 2 })],
      data,
      planned,
    });

    expect(contradictions).toEqual([
      'skill 71 is stored confirmed as advancement 2, the entry makes it advancement 1',
    ]);
  });

  it('reports a stored free extra the entry lists as paid', () => {
    const { contradictions } = service.compare({
      fields: blank,
      rows: [stored({ isFreeExtra: true, orderConfirmed: false })],
      data,
      planned,
    });

    expect(contradictions).toEqual([
      'skill 71 is stored as a free extra, the entry lists it as a paid advancement',
    ]);
  });

  it('accepts a stored unconfirmed advancement the fill will confirm, which is not yet identical', () => {
    expect(
      service.compare({
        fields: filled,
        rows: [
          startingRow,
          stored({
            source: 'advancement',
            orderConfirmed: false,
            advancementOrder: null,
          }),
        ],
        data,
        planned,
      }),
    ).toEqual({ contradictions: [], identical: false });
  });

  it('finds a stored chosen skill identical to an entry that does not say chosen or random', () => {
    const plannedAdvancement = planned.map((row) =>
      row.paidNumber === null
        ? row
        : { ...row, source: 'advancement' as const },
    );

    expect(
      service.compare({
        fields: filled,
        rows: [startingRow, stored()],
        data,
        planned: plannedAdvancement,
      }).identical,
    ).toBe(true);
  });

  it('matches characteristic increases by characteristic and, when confirmed, by number', () => {
    const increases: PlannedFillRow[] = [1, 2].map((paidNumber) => ({
      skillId: null,
      characteristic: 'AG',
      attributeValue: null,
      source: 'characteristic',
      isFreeExtra: false,
      paidNumber,
    }));
    const increase = (advancementOrder: number) =>
      stored({
        skillId: null,
        characteristic: 'AG',
        source: 'characteristic',
        advancementOrder,
      });

    expect(
      service.compare({
        fields: blank,
        rows: [increase(2), increase(1)],
        data,
        planned: increases,
      }).contradictions,
    ).toEqual([]);
  });

  it('is not identical when a planned row is not stored yet', () => {
    expect(
      service.compare({ fields: filled, rows: [startingRow], data, planned })
        .identical,
    ).toBe(false);
  });
});
