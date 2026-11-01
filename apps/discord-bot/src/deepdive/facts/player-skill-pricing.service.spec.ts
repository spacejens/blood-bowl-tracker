import type {
  PlayerSkillRow,
  PricingModel,
} from '@blood-bowl-tracker/game-data';
import { PlayerPricingModelService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import {
  mockDatabaseTimeout,
  stubDatabaseTimeoutOnce,
} from '../../database-timeout-mock.test-helpers';
import { ErrorLogService } from '../../shared/error-log.service';
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
    ...overrides,
  };
}

/**
 * Built per test: the era's pricing model is an input the lookup mock must
 * carry before the service is compiled.
 */
async function makeService(model: PricingModel | null = 'kind_priced') {
  const pricing = mock<PlayerPricingModelService>();
  pricing.pricingModelForPlayer.mockResolvedValue(model);
  const databaseTimeout = mockDatabaseTimeout();
  const errorLog = mock<ErrorLogService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerSkillPricingService,
      { provide: PlayerPricingModelService, useValue: pricing },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: ErrorLogService, useValue: errorLog },
    ],
  }).compile();
  return {
    service: moduleRef.get(PlayerSkillPricingService),
    pricing,
    databaseTimeout,
    errorLog,
  };
}

describe('PlayerSkillPricingService', () => {
  it('is true for an advancement of unknown source in a kind-priced era', async () => {
    const { service, pricing } = await makeService('kind_priced');

    await expect(service.pricesByKind(PLAYER, [skill()])).resolves.toBe(true);
    expect(pricing.pricingModelForPlayer).toHaveBeenCalledWith(PLAYER);
  });

  it('is false in a fixed-threshold era', async () => {
    const { service } = await makeService('fixed_threshold');

    await expect(service.pricesByKind(PLAYER, [skill()])).resolves.toBe(false);
  });

  it('is false when the era has no pricing model', async () => {
    const { service } = await makeService(null);

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
    const { service, pricing, databaseTimeout } = await makeService();

    await expect(service.pricesByKind(PLAYER, rows)).resolves.toBe(false);
    expect(pricing.pricingModelForPlayer).not.toHaveBeenCalled();
    expect(databaseTimeout.run).not.toHaveBeenCalled();
  });

  it('runs the lookup under the database timeout with a null fallback', async () => {
    const { service, databaseTimeout } = await makeService();

    await service.pricesByKind(PLAYER, [skill()]);

    expect(databaseTimeout.run).toHaveBeenCalledWith(expect.any(Promise), null);
  });

  it('is false when the lookup times out', async () => {
    const { service, databaseTimeout } = await makeService('kind_priced');
    stubDatabaseTimeoutOnce(databaseTimeout);

    await expect(service.pricesByKind(PLAYER, [skill()])).resolves.toBe(false);
  });

  it('is false and logs when the lookup fails', async () => {
    const { service, pricing, errorLog } = await makeService();
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
