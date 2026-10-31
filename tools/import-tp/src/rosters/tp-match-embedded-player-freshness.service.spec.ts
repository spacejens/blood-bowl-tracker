import type { TpMatchEmbeddedPlayer } from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpMatchEmbeddedPlayerFreshnessService } from './tp-match-embedded-player-freshness.service';

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

  it('takes the candidate when nothing is known yet', () => {
    const candidate = entry();
    expect(service.fresher(undefined, candidate)).toBe(candidate);
  });

  it('takes the entry with the higher career total', () => {
    const known = entry({ totalStarPlayerPoints: 20 });
    const candidate = entry({ totalStarPlayerPoints: 12 });
    expect(service.fresher(known, candidate)).toBe(known);
    expect(service.fresher(candidate, known)).toBe(known);
  });

  it('takes the later entry on a tie', () => {
    const known = entry({ starPlayerPoints: 1 });
    const candidate = entry({ starPlayerPoints: 2 });
    expect(service.fresher(known, candidate)).toBe(candidate);
  });
});
