import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { MercenaryCharacteristicsConfigService } from './mercenary-characteristics-config.service';

describe('MercenaryCharacteristicsConfigService', () => {
  let service: MercenaryCharacteristicsConfigService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [MercenaryCharacteristicsConfigService],
    }).compile();
    service = moduleRef.get(MercenaryCharacteristicsConfigService);
  });

  it('returns every curated rules set for a known mercenary position', () => {
    const curated = service.forPosition('Giant Mercenary');

    expect(curated).toBeDefined();
    expect([...(curated?.keys() ?? [])]).toEqual(['BB2020']);
  });

  it('returns undefined for a mercenary position with no curated entry at all', () => {
    expect(service.forPosition('Bogus Mercenary')).toBeUndefined();
  });

  it('returns the curated characteristics for a known position and rules set', () => {
    expect(
      service.forPositionAndRulesSet({
        positionName: 'Giant Mercenary',
        rulesSetName: 'BB2020',
      }),
    ).toEqual({
      move: 6,
      strength: 7,
      agility: 5,
      passing: 5,
      armour: 11,
    });
  });

  it('returns undefined for a known position under an uncurated rules set', () => {
    expect(
      service.forPositionAndRulesSet({
        positionName: 'Giant Mercenary',
        rulesSetName: 'BB2025',
      }),
    ).toBeUndefined();
  });

  it('returns undefined for an unknown position under a known rules set', () => {
    expect(
      service.forPositionAndRulesSet({
        positionName: 'Bogus Mercenary',
        rulesSetName: 'BB2020',
      }),
    ).toBeUndefined();
  });
});
