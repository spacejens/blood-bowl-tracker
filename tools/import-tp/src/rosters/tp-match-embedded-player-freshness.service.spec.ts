import type { TpMatchEmbeddedPlayer } from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  type FreshestMatchEntries,
  TpMatchEmbeddedPlayerFreshnessService,
} from './tp-match-embedded-player-freshness.service';

function entry(
  overrides: Partial<TpMatchEmbeddedPlayer> = {},
): TpMatchEmbeddedPlayer {
  return {
    id: 5001,
    name: 'Grim',
    number: 1,
    lineUpMasterId: 77,
    rosterId: 163386,
    fallbackPositionName: 'Lineman',
    isBigGuy: false,
    totalStarPlayerPoints: 12,
    ...overrides,
  };
}

describe('TpMatchEmbeddedPlayerFreshnessService', () => {
  let service: TpMatchEmbeddedPlayerFreshnessService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpMatchEmbeddedPlayerFreshnessService],
    }).compile();
    service = moduleRef.get(TpMatchEmbeddedPlayerFreshnessService);
  });

  function fold(...candidates: TpMatchEmbeddedPlayer[]) {
    const freshest = new Map<number, FreshestMatchEntries>();
    for (const candidate of candidates) {
      service.accumulate(freshest, candidate);
    }
    return freshest.get(5001);
  }

  it('takes the first entry when nothing is known yet', () => {
    const only = entry({ starPlayerPoints: 2 });
    expect(fold(only)).toEqual({ latest: only, withUnspent: only });
  });

  it('keeps no unspent entry when none carries a figure', () => {
    const only = entry();
    expect(fold(only)).toEqual({ latest: only });
  });

  it('takes the entry with the higher career total, in either order', () => {
    const low = entry({ totalStarPlayerPoints: 12, starPlayerPoints: 0 });
    const high = entry({ totalStarPlayerPoints: 20, starPlayerPoints: 8 });
    expect(fold(low, high)?.latest).toBe(high);
    expect(fold(high, low)?.latest).toBe(high);
    expect(fold(low, high)?.withUnspent).toBe(high);
    expect(fold(high, low)?.withUnspent).toBe(high);
  });

  it('takes the lower unspent figure at equal totals, in either order', () => {
    const stale = entry({ totalStarPlayerPoints: 20, starPlayerPoints: 6 });
    const fresh = entry({ totalStarPlayerPoints: 20, starPlayerPoints: 0 });
    for (const result of [fold(stale, fresh), fold(fresh, stale)]) {
      expect(result?.latest).toBe(fresh);
      expect(result?.withUnspent).toBe(fresh);
    }
  });

  it('takes the later entry when total and unspent figure are equal', () => {
    const first = entry({ starPlayerPoints: 3 });
    const second = entry({ starPlayerPoints: 3 });
    expect(fold(first, second)?.latest).toBe(second);
  });

  it('takes the later entry at equal totals when one has no figure', () => {
    const withFigure = entry({ starPlayerPoints: 3 });
    const without = entry();
    expect(fold(withFigure, without)?.latest).toBe(without);
    expect(fold(without, withFigure)?.latest).toBe(withFigure);
  });

  it('keeps the freshest figure-carrying entry apart from a fresher one without a figure', () => {
    const withFigure = entry({
      totalStarPlayerPoints: 12,
      starPlayerPoints: 2,
    });
    const without = entry({ totalStarPlayerPoints: 20 });
    for (const result of [
      fold(withFigure, without),
      fold(without, withFigure),
    ]) {
      expect(result?.latest).toBe(without);
      expect(result?.withUnspent).toBe(withFigure);
    }
  });

  describe('entries', () => {
    it('lists the figure-carrying entry before the freshest one, so the freshest wins state', () => {
      const withFigure = entry({
        totalStarPlayerPoints: 12,
        starPlayerPoints: 2,
      });
      const without = entry({ totalStarPlayerPoints: 20 });
      const freshest = new Map([
        [5001, { latest: without, withUnspent: withFigure }],
      ]);
      expect(service.entries(freshest)).toEqual([withFigure, without]);
    });

    it('lists one entry when the freshest also carries the figure or none does', () => {
      const both = entry({ starPlayerPoints: 2 });
      const neither = entry({ id: 5002 });
      const freshest = new Map([
        [5001, { latest: both, withUnspent: both }],
        [5002, { latest: neither }],
      ]);
      expect(service.entries(freshest)).toEqual([both, neither]);
    });
  });
});
