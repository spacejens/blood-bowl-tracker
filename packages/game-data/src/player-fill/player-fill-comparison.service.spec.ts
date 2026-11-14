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

  describe('matching order', () => {
    const agIncreases: PlannedFillRow[] = [1, 2].map((paidNumber) => ({
      skillId: null,
      characteristic: 'AG',
      attributeValue: null,
      source: 'characteristic',
      isFreeExtra: false,
      paidNumber,
    }));
    const agRow = (overrides: Partial<StoredFillRow>): StoredFillRow =>
      stored({
        skillId: null,
        characteristic: 'AG',
        source: 'characteristic',
        ...overrides,
      });
    const unconfirmedAg = agRow({
      orderConfirmed: false,
      advancementOrder: null,
    });

    it('lets a confirmed increase claim its number before an earlier unconfirmed one', () => {
      expect(
        service.compare({
          fields: blank,
          rows: [unconfirmedAg, agRow({ advancementOrder: 1 })],
          data,
          planned: agIncreases,
        }).contradictions,
      ).toEqual([]);
    });

    it('finds such a partly confirmed pair of increases not yet identical, and a fully confirmed one identical', () => {
      const compare = (rows: StoredFillRow[]) =>
        service.compare({
          fields: filled,
          rows,
          data: { ...data, startingSkills: [], advancements: [] },
          planned: agIncreases,
        });

      expect(
        compare([unconfirmedAg, agRow({ advancementOrder: 1 })]).identical,
      ).toBe(false);
      expect(
        compare([
          agRow({ advancementOrder: 2 }),
          agRow({ advancementOrder: 1 }),
        ]).identical,
      ).toBe(true);
    });

    it('lets a confirmed repeated skill claim its number before an earlier unconfirmed one', () => {
      const twice: PlannedFillRow[] = [1, 2].map((paidNumber) => ({
        ...planned[1],
        paidNumber,
      }));

      expect(
        service.compare({
          fields: blank,
          rows: [
            stored({ orderConfirmed: false, advancementOrder: null }),
            stored({ advancementOrder: 1 }),
          ],
          data,
          planned: twice,
        }).contradictions,
      ).toEqual([]);
    });

    it('still reports contradictions in the order the rows are stored', () => {
      expect(
        service.compare({
          fields: blank,
          rows: [
            stored({ skillId: 98, orderConfirmed: false }),
            stored({ skillId: 99 }),
          ],
          data,
          planned,
        }).contradictions,
      ).toEqual([
        'skill 98 is stored but not in the entry',
        'skill 99 is stored but not in the entry',
      ]);
    });
  });

  it('is not identical when the source differs beyond chosen or random', () => {
    expect(
      service.compare({
        fields: filled,
        rows: [startingRow, stored({ source: 'advancement' })],
        data,
        planned,
      }),
    ).toEqual({ contradictions: [], identical: false });
  });

  it('is not identical when a free extra is stored as paid', () => {
    const freeExtra = planned.map((row) =>
      row.paidNumber === null
        ? row
        : { ...row, isFreeExtra: true, paidNumber: null },
    );

    expect(
      service.compare({
        fields: filled,
        rows: [
          startingRow,
          stored({ orderConfirmed: false, advancementOrder: null }),
        ],
        data,
        planned: freeExtra,
      }),
    ).toEqual({ contradictions: [], identical: false });
  });

  it('is not identical when a paid row is stored unconfirmed', () => {
    expect(
      service.compare({
        fields: filled,
        rows: [
          startingRow,
          stored({ orderConfirmed: false, advancementOrder: null }),
        ],
        data,
        planned,
      }).identical,
    ).toBe(false);
  });

  it('reports a disagreeing ST, AG and AV', () => {
    expect(
      service.compare({
        fields: { ...blank, strength: 4, agility: 2, armour: 8 },
        rows: [],
        data,
        planned,
      }).contradictions,
    ).toEqual([
      'stored ST 4, the entry says 3',
      'stored AG 2, the entry says 3',
      'stored AV 8, the entry says 9',
    ]);
  });

  it('accepts a stored zero characteristic against a non-zero entry', () => {
    expect(
      service.compare({
        fields: { ...filled, move: 0, strength: 0, agility: 0, armour: 0 },
        rows: [startingRow, stored()],
        data,
        planned,
      }),
    ).toEqual({ contradictions: [], identical: false });
  });

  it('reports a confirmed stored row the entry makes a free extra', () => {
    const freeExtra = planned.map((row) =>
      row.paidNumber === null
        ? row
        : { ...row, isFreeExtra: true, paidNumber: null },
    );

    expect(
      service.compare({
        fields: blank,
        rows: [stored()],
        data,
        planned: freeExtra,
      }).contradictions,
    ).toEqual([
      'skill 71 is stored confirmed as advancement 1, the entry makes it a free extra',
    ]);
  });

  it('is not identical when a planned row is not stored yet', () => {
    expect(
      service.compare({ fields: filled, rows: [startingRow], data, planned })
        .identical,
    ).toBe(false);
  });
});
