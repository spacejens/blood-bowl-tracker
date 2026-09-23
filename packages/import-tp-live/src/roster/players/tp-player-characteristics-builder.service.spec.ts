import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpPlayerCharacteristicsBuilderService } from './tp-player-characteristics-builder.service';

const characteristics = {
  move: 6,
  strength: 3,
  agility: 3,
  passing: 4,
  armour: 9,
};

describe('TpPlayerCharacteristicsBuilderService', () => {
  let builder: TpPlayerCharacteristicsBuilderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpPlayerCharacteristicsBuilderService],
    }).compile();
    builder = moduleRef.get(TpPlayerCharacteristicsBuilderService);
  });

  it("builds a full payload from a player's own characteristics", () => {
    expect(
      builder.forRosterPlayer({ characteristics, rulesSetId: 900 }),
    ).toEqual({ ...characteristics, rulesSetId: 900 });
  });

  it('carries a zero Passing through unchanged', () => {
    expect(
      builder.forRosterPlayer({
        characteristics: { ...characteristics, passing: 0 },
        rulesSetId: 900,
      })?.passing,
    ).toBe(0);
  });

  it('returns nothing when the player carries no characteristics', () => {
    expect(
      builder.forRosterPlayer({ characteristics: undefined, rulesSetId: 900 }),
    ).toBeUndefined();
  });

  it('returns nothing when the era has no single rules set', () => {
    expect(
      builder.forRosterPlayer({ characteristics, rulesSetId: undefined }),
    ).toBeUndefined();
  });
});
