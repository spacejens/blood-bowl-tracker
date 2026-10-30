import type {
  KnownUnspentSpp,
  UnspentSppUnknownReason,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { NumberFormatterService } from '../../shared/number-formatter.service';
import { UnspentSppLineService } from './unspent-spp-line.service';

/** A known result; each test overrides only the fields it is about. */
function known(overrides: Partial<KnownUnspentSpp>): KnownUnspentSpp {
  return {
    status: 'known',
    totalSpp: 12,
    advancementsGained: 1,
    spentMin: 6,
    spentMax: 6,
    unspentMin: 6,
    unspentMax: 6,
    cheapestNextCost: 6,
    coversAnother: 'yes',
    ...overrides,
  };
}

describe('UnspentSppLineService', () => {
  let service: UnspentSppLineService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      // NumberFormatterService is pure and dependency-free, so it is passed
      // real (CLAUDE.md's pure-chain carve-out) and the specs assert the
      // actual rendered text.
      providers: [UnspentSppLineService, NumberFormatterService],
    }).compile();
    service = moduleRef.get(UnspentSppLineService);
  });

  it.each([
    [
      'an exact figure that covers the cheapest next advancement',
      known({}),
      'Unspent SPP: 6 (covers another advancement)',
    ],
    [
      'a range that may cover it',
      known({ unspentMin: 5, unspentMax: 11, coversAnother: 'maybe' }),
      'Unspent SPP: 5–11 (may cover another advancement)',
    ],
    [
      'a figure that does not cover it',
      known({ unspentMin: 2, unspentMax: 2, coversAnother: 'no' }),
      'Unspent SPP: 2 (not enough for another advancement)',
    ],
    [
      'a positive figure with no further advancement, whatever the verdict',
      known({
        unspentMin: 40,
        unspentMax: 40,
        cheapestNextCost: null,
        coversAnother: 'no',
      }),
      'Unspent SPP: 40 (no further advancements available)',
    ],
    [
      'a range with no further advancement',
      known({
        unspentMin: 38,
        unspentMax: 40,
        cheapestNextCost: null,
        coversAnother: 'no',
      }),
      'Unspent SPP: 38–40 (no further advancements available)',
    ],
    [
      'zero, with no verdict',
      known({ unspentMin: 0, unspentMax: 0, coversAnother: 'no' }),
      'Unspent SPP: 0',
    ],
    [
      'zero with no further advancement, still with no note',
      known({ unspentMin: 0, unspentMax: 0, cheapestNextCost: null }),
      'Unspent SPP: 0',
    ],
    [
      'a negative figure as is, with no verdict',
      known({ unspentMin: -2, unspentMax: -2, coversAnother: 'no' }),
      'Unspent SPP: -2',
    ],
    [
      'a range topping out at zero, with no verdict',
      known({ unspentMin: -3, unspentMax: 0, coversAnother: 'no' }),
      'Unspent SPP: -3–0',
    ],
    [
      'a range from negative to positive, with its verdict',
      known({ unspentMin: -2, unspentMax: 4, coversAnother: 'maybe' }),
      'Unspent SPP: -2–4 (may cover another advancement)',
    ],
    [
      'large figures with thousands separators',
      known({ unspentMin: 1234, unspentMax: 2345 }),
      'Unspent SPP: 1,234–2,345 (covers another advancement)',
    ],
  ])('shows %s', (_case, result, expected) => {
    expect(service.build(result)).toBe(expected);
  });

  it('shows a timed-out lookup as unknown', () => {
    expect(service.build(null)).toBe('Unspent SPP: unknown (lookup timed out)');
  });

  it.each([
    ['star_player', 'star players do not advance'],
    ['no_rules_set', "no rules set for the player's era"],
    ['no_costs', 'no advancement costs for the rules set'],
    ['inconsistent_history', 'advancement history does not fit the rules'],
    ['no_total_spp', 'no total SPP'],
  ] satisfies [UnspentSppUnknownReason, string][])(
    'shows the %s reason in plain words',
    (reason, words) => {
      expect(service.build({ status: 'unknown', reason })).toBe(
        `Unspent SPP: unknown (${words})`,
      );
    },
  );
});
