import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { UnspentSppModel } from './advancement-cost-model.types';
import { SourceSpendComparisonService } from './source-spend-comparison.service';
import type { SourceUnspentSppFigure } from './source-unspent-spp-figure.service';

const KIND_PRICED: UnspentSppModel = {
  rulesSetName: 'BB2020',
  fixedThresholds: false,
  rows: [],
  totalSpp: 50,
  range: { spentMin: 10, spentMax: 20, unspentMin: 30, unspentMax: 40 },
  unknownReason: null,
};

const FIXED: UnspentSppModel = {
  ...KIND_PRICED,
  rulesSetName: 'CRP',
  fixedThresholds: true,
};

function figure(
  source: 'bbl' | 'tp',
  reportedTotal: number | null,
  unspent: number | null,
): SourceUnspentSppFigure {
  return {
    source,
    unspentLabel: `${source} unspent`,
    unspent,
    totalLabel: `${source} total`,
    reportedTotal,
    spendLabel: `${source} spend`,
  };
}

describe('SourceSpendComparisonService', () => {
  let service: SourceSpendComparisonService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [SourceSpendComparisonService],
    }).compile();
    service = moduleRef.get(SourceSpendComparisonService);
  });

  it.each([
    ['below', 9],
    ['inside', 10],
    ['inside', 15],
    ['inside', 20],
    ['above', 21],
  ] as const)(
    'places a reported spend %s the modelled spend range 10 to 20 (spend %d)',
    (placement, spend) => {
      expect(
        service.compare(KIND_PRICED, figure('tp', 30, 30 - spend)),
      ).toEqual({ kind: 'compared', reportedSpend: spend, placement });
    },
  );

  it.each([
    [null, 4],
    [40, null],
    [null, null],
  ])(
    'makes no comparison when the total is %o or the unspent figure is %o',
    (total, unspent) => {
      expect(
        service.compare(KIND_PRICED, figure('bbl', total, unspent)),
      ).toEqual({ kind: 'none' });
    },
  );

  it('makes no comparison without a source figure', () => {
    expect(service.compare(KIND_PRICED, null)).toEqual({ kind: 'none' });
  });

  it('makes no comparison when the range is unknown', () => {
    expect(
      service.compare(
        { ...KIND_PRICED, range: null, unknownReason: 'no_costs' },
        figure('tp', 30, 15),
      ),
    ).toEqual({ kind: 'none' });
  });

  it('does not compare a BBL figure under a fixed-threshold rules set', () => {
    expect(service.compare(FIXED, figure('bbl', 30, 1))).toEqual({
      kind: 'not_compared',
      reportedSpend: 29,
    });
  });

  it('compares a BBL figure under a kind-priced rules set', () => {
    expect(service.compare(KIND_PRICED, figure('bbl', 30, 1))).toEqual({
      kind: 'compared',
      reportedSpend: 29,
      placement: 'above',
    });
  });

  it('compares a TP figure under a fixed-threshold rules set', () => {
    expect(service.compare(FIXED, figure('tp', 30, 1))).toEqual({
      kind: 'compared',
      reportedSpend: 29,
      placement: 'above',
    });
  });
});
