import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { FittingOutcome } from './unspent-spp.types';
import { UnspentSppCombinationService } from './unspent-spp-combination.service';

function fits(overrides: Partial<FittingOutcome> = {}): FittingOutcome {
  return {
    kind: 'fits',
    advancementsGained: 2,
    spentMin: 7,
    spentMax: 14,
    cheapestNextCost: 6,
    coversAnother: 'yes',
    ...overrides,
  };
}

describe('UnspentSppCombinationService', () => {
  let service: UnspentSppCombinationService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [UnspentSppCombinationService],
    }).compile();
    service = moduleRef.get(UnspentSppCombinationService);
  });

  describe('combine', () => {
    it('is unknown for lack of costs when no rules set has any', () => {
      expect(service.combine(30, [{ kind: 'no_costs' }])).toEqual({
        status: 'unknown',
        reason: 'no_costs',
      });
    });

    it('is an inconsistent history when costs exist but none fits', () => {
      expect(
        service.combine(30, [{ kind: 'no_costs' }, { kind: 'inconsistent' }]),
      ).toEqual({ status: 'unknown', reason: 'inconsistent_history' });
    });

    it('keeps the widest range and the cheapest next cost over the fitting rules sets', () => {
      expect(
        service.combine(30, [
          fits(),
          { kind: 'inconsistent' },
          fits({ spentMin: 10, spentMax: 20, cheapestNextCost: 8 }),
        ]),
      ).toEqual({
        status: 'known',
        totalSpp: 30,
        advancementsGained: 2,
        spentMin: 7,
        spentMax: 20,
        unspentMin: 10,
        unspentMax: 23,
        cheapestNextCost: 6,
        coversAnother: 'yes',
        storedVerdict: 'none_stored',
        storedUnspentSpp: null,
      });
    });

    it('merges verdicts that disagree into maybe', () => {
      const result = service.combine(30, [
        fits({ coversAnother: 'yes' }),
        fits({ coversAnother: 'no' }),
      ]);

      expect(result).toMatchObject({ coversAnother: 'maybe' });
    });

    it('has no next cost when no fitting rules set prices one', () => {
      const result = service.combine(30, [fits({ cheapestNextCost: null })]);

      expect(result).toMatchObject({ cheapestNextCost: null });
    });
  });

  describe('coversAnother', () => {
    it('is no when there is no further advancement', () => {
      expect(service.coversAnother(10, 20, null)).toBe('no');
    });

    it('is no when even the largest unspent figure falls short', () => {
      expect(service.coversAnother(1, 5, 6)).toBe('no');
    });

    it('is yes when even the smallest unspent figure covers it', () => {
      expect(service.coversAnother(6, 9, 6)).toBe('yes');
    });

    it('is maybe in between', () => {
      expect(service.coversAnother(3, 9, 6)).toBe('maybe');
    });
  });
});
