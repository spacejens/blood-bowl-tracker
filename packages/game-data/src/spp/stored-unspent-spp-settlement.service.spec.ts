import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { StoredUnspentSppSettlementService } from './stored-unspent-spp-settlement.service';
import type { KnownUnspentSpp } from './unspent-spp.types';

/** BB2020, total 30, two gained skills of unknown kind. */
const RANGE: KnownUnspentSpp = {
  status: 'known',
  totalSpp: 30,
  advancementsGained: 2,
  spentMin: 7,
  spentMax: 26,
  unspentMin: 4,
  unspentMax: 23,
  cheapestNextCost: 6,
  coversAnother: 'maybe',
  storedVerdict: 'none_stored',
  storedUnspentSpp: null,
};

describe('StoredUnspentSppSettlementService', () => {
  let service: StoredUnspentSppSettlementService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [StoredUnspentSppSettlementService],
    }).compile();
    service = moduleRef.get(StoredUnspentSppSettlementService);
  });

  it('leaves the range alone when nothing is stored', () => {
    expect(service.settle(RANGE, { stored: null, nextCosts: [6] })).toEqual(
      RANGE,
    );
  });

  it('settles the range to a stored figure inside it', () => {
    expect(service.settle(RANGE, { stored: 10, nextCosts: [6] })).toEqual({
      ...RANGE,
      spentMin: 20,
      spentMax: 20,
      unspentMin: 10,
      unspentMax: 10,
      coversAnother: 'yes',
      storedVerdict: 'settled',
      storedUnspentSpp: 10,
    });
  });

  it('settles at the bounds, working the verdict out exactly', () => {
    expect(
      service.settle(RANGE, { stored: 4, nextCosts: [6] }).coversAnother,
    ).toBe('no');
    expect(
      service.settle(RANGE, { stored: 23, nextCosts: [6] }).storedVerdict,
    ).toBe('settled');
  });

  it('keeps the range and flags a stored figure outside it', () => {
    expect(service.settle(RANGE, { stored: 3, nextCosts: [6] })).toEqual({
      ...RANGE,
      storedVerdict: 'outside_range',
      storedUnspentSpp: 3,
    });
    expect(
      service.settle(RANGE, { stored: 24, nextCosts: [6] }).storedUnspentSpp,
    ).toBe(24);
    expect(
      service.settle(RANGE, { stored: 24, nextCosts: [6] }).storedVerdict,
    ).toBe('outside_range');
  });

  it("merges each rules set's own verdict", () => {
    const wide = { ...RANGE, unspentMin: 2, unspentMax: 14 };
    expect(
      service.settle(wide, { stored: 5, nextCosts: [10, 4] }).coversAnother,
    ).toBe('maybe');
    expect(
      service.settle(wide, { stored: 12, nextCosts: [10, 4] }).coversAnother,
    ).toBe('yes');
  });

  it('says no when no further advancement exists', () => {
    expect(
      service.settle(RANGE, { stored: 10, nextCosts: [null] }).coversAnother,
    ).toBe('no');
    expect(
      service.settle(RANGE, { stored: 10, nextCosts: [] }).coversAnother,
    ).toBe('no');
  });
});
