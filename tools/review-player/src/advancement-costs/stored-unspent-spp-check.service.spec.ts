import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { UnspentSppModel } from './advancement-cost-model.types';
import { SourceSpendComparisonService } from './source-spend-comparison.service';
import type { SourceUnspentSppFigure } from './source-unspent-spp-figure.service';
import { StoredUnspentSppCheckService } from './stored-unspent-spp-check.service';

const KIND_PRICED: UnspentSppModel = {
  rulesSetName: 'BB2020',
  fixedThresholds: false,
  rows: [],
  totalSpp: 60,
  range: { spentMin: 10, spentMax: 20, unspentMin: 40, unspentMax: 50 },
  unknownReason: null,
};
const FIXED: UnspentSppModel = { ...KIND_PRICED, fixedThresholds: true };

function figure(
  source: 'bbl' | 'tp',
  unspent: number | null,
): SourceUnspentSppFigure {
  return {
    source,
    unspentLabel: 'unspent',
    unspent,
    totalLabel: 'total',
    reportedTotal: 60,
    spendLabel: 'spend',
  };
}

describe('StoredUnspentSppCheckService', () => {
  let service: StoredUnspentSppCheckService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        StoredUnspentSppCheckService,
        // Pure and dependency-free: passed real, so the BBL rule is the one
        // the panel and the stratum use.
        SourceSpendComparisonService,
      ],
    }).compile();
    service = moduleRef.get(StoredUnspentSppCheckService);
  });

  it('has nothing to check when nothing is stored', () => {
    const check = service.check(KIND_PRICED, null, figure('tp', 45));
    expect(check).toEqual({ kind: 'none_stored' });
    expect(service.disagrees(check)).toBe(false);
  });

  it.each([
    [39, 'below', true],
    [40, 'inside', false],
    [50, 'inside', false],
    [51, 'above', true],
  ] as const)(
    'places %i %s the modelled unspent range',
    (stored, placement, flagged) => {
      const check = service.check(KIND_PRICED, stored, figure('tp', stored));
      expect(check).toEqual({
        kind: 'stored',
        stored,
        placement,
        source: 'matches',
        sourceUnspent: stored,
      });
      expect(service.disagrees(check)).toBe(flagged);
    },
  );

  it('flags a stored figure that differs from the source', () => {
    const check = service.check(KIND_PRICED, 45, figure('tp', 44));
    expect(check).toMatchObject({ source: 'differs', sourceUnspent: 44 });
    expect(service.disagrees(check)).toBe(true);
  });

  it('does not compare a BBL figure under fixed thresholds', () => {
    const check = service.check(FIXED, 45, figure('bbl', 3));
    expect(check).toMatchObject({
      source: 'not_compared',
      placement: 'inside',
    });
    expect(service.disagrees(check)).toBe(false);
  });

  it('compares a TP figure under fixed thresholds', () => {
    expect(service.check(FIXED, 45, figure('tp', 3))).toMatchObject({
      source: 'differs',
    });
  });

  it('has no source comparison without a figure, and no placement without a range', () => {
    expect(service.check({ ...KIND_PRICED, range: null }, 45, null)).toEqual({
      kind: 'stored',
      stored: 45,
      placement: null,
      source: 'no_figure',
      sourceUnspent: null,
    });
    expect(service.check(KIND_PRICED, 45, figure('tp', null))).toMatchObject({
      source: 'no_figure',
    });
  });
});
