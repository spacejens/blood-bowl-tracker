import type { PlayerSkillRow } from '@blood-bowl-tracker/game-data';
import { PlayerPricingModelService } from '@blood-bowl-tracker/game-data';
import { ErrorLogService } from '@blood-bowl-tracker/logging';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import {
  mockDatabaseTimeout,
  stubDatabaseTimeoutOnce,
} from '../../database-timeout-mock.test-helpers';
import { PlayerSkillPricingService } from './player-skill-pricing.service';

const PLAYER = 1;

/** One row, defaulted to a gained skill of unknown source. */
function skill(overrides: Partial<PlayerSkillRow> = {}): PlayerSkillRow {
  return {
    skillId: 1,
    skillName: 'Guard',
    source: 'advancement',
    attributeValue: null,
    advancementOrder: 0,
    category: 'general',
    isElite: false,
    isFreeExtra: false,
    orderConfirmed: true,
    ...overrides,
  };
}

describe('PlayerSkillPricingService', () => {
  let service: PlayerSkillPricingService;
  let pricing: MockProxy<PlayerPricingModelService>;
  let databaseTimeout: ReturnType<typeof mockDatabaseTimeout>;
  let errorLog: MockProxy<ErrorLogService>;

  beforeEach(async () => {
    pricing = mock<PlayerPricingModelService>();
    pricing.pricingModelForPlayer.mockResolvedValue('kind_priced');
    databaseTimeout = mockDatabaseTimeout();
    errorLog = mock<ErrorLogService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerSkillPricingService,
        { provide: PlayerPricingModelService, useValue: pricing },
        { provide: DatabaseTimeoutService, useValue: databaseTimeout },
        { provide: ErrorLogService, useValue: errorLog },
      ],
    }).compile();
    service = moduleRef.get(PlayerSkillPricingService);
  });

  it('is true for an advancement of unknown source in a kind-priced era', async () => {
    await expect(service.pricesByKind(PLAYER, [skill()])).resolves.toBe(true);
    expect(pricing.pricingModelForPlayer).toHaveBeenCalledWith(PLAYER);
  });

  it('is false in a fixed-threshold era', async () => {
    pricing.pricingModelForPlayer.mockResolvedValue('fixed_threshold');

    await expect(service.pricesByKind(PLAYER, [skill()])).resolves.toBe(false);
  });

  it('is false when the era has no pricing model', async () => {
    pricing.pricingModelForPlayer.mockResolvedValue(undefined);

    await expect(service.pricesByKind(PLAYER, [skill()])).resolves.toBe(false);
  });

  it.each<[string, PlayerSkillRow[]]>([
    ['no skills', []],
    [
      'only a starting skill',
      [skill({ source: 'starting', advancementOrder: null })],
    ],
    ['only a chosen skill', [skill({ source: 'chosen' })]],
    ['only a rolled skill', [skill({ source: 'random' })]],
    ['only a free extra', [skill({ isFreeExtra: true })]],
  ])('skips the lookup for a player with %s', async (_label, rows) => {
    await expect(service.pricesByKind(PLAYER, rows)).resolves.toBe(false);
    expect(pricing.pricingModelForPlayer).not.toHaveBeenCalled();
    expect(databaseTimeout.run).not.toHaveBeenCalled();
  });

  it('runs the lookup under the database timeout with an undefined fallback', async () => {
    await service.pricesByKind(PLAYER, [skill()]);

    expect(databaseTimeout.run).toHaveBeenCalledWith(
      expect.any(Promise),
      undefined,
    );
  });

  it('is false when the lookup times out', async () => {
    stubDatabaseTimeoutOnce(databaseTimeout);

    await expect(service.pricesByKind(PLAYER, [skill()])).resolves.toBe(false);
  });

  it('is false and logs when the lookup fails', async () => {
    const failure = new Error('connection lost');
    pricing.pricingModelForPlayer.mockRejectedValue(failure);

    await expect(service.pricesByKind(PLAYER, [skill()])).resolves.toBe(false);
    expect(errorLog.logError).toHaveBeenCalledWith(
      expect.anything(),
      'Failed to look up the advancement pricing model',
      failure,
    );
  });
});
