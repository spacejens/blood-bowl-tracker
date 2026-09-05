import { ConfigErrorMessageService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ImportTpConfigService } from '../config/import-tp-config.service';
import { MercenaryCharacteristicsConfigService } from './mercenary-characteristics-config.service';

const GIANT_MERCENARY_BB2020 = {
  positionName: 'Giant Mercenary',
  rulesSetName: 'BB2020',
  move: 6,
  strength: 7,
  agility: 5,
  passing: 5,
  armour: 11,
};

describe('MercenaryCharacteristicsConfigService', () => {
  let config: MockProxy<ImportTpConfigService>;
  let service: MercenaryCharacteristicsConfigService;

  beforeEach(async () => {
    config = mock<ImportTpConfigService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        MercenaryCharacteristicsConfigService,
        { provide: ImportTpConfigService, useValue: config },
        // Real, not mocked: a pure, dependency-free formatting service whose
        // exact output is what this spec's error assertions check.
        ConfigErrorMessageService,
      ],
    }).compile();
    service = moduleRef.get(MercenaryCharacteristicsConfigService);
  });

  function withMercenaries(entries: unknown): void {
    config.get.mockImplementation((key: string) =>
      key === 'mercenaries' ? entries : undefined,
    );
  }

  it('returns every curated rules set for a known mercenary position', () => {
    withMercenaries([GIANT_MERCENARY_BB2020]);

    const curated = service.forPosition('Giant Mercenary');

    expect(curated).toBeDefined();
    expect([...(curated?.keys() ?? [])]).toEqual(['BB2020']);
  });

  it('accumulates more than one rules set for the same mercenary position', () => {
    withMercenaries([
      GIANT_MERCENARY_BB2020,
      { ...GIANT_MERCENARY_BB2020, rulesSetName: 'DB2021', move: 5 },
    ]);

    const curated = service.forPosition('Giant Mercenary');

    expect([...(curated?.keys() ?? [])]).toEqual(['BB2020', 'DB2021']);
    expect(curated?.get('DB2021')?.move).toBe(5);
  });

  it('throws when two entries share the same positionName and rulesSetName', () => {
    withMercenaries([
      GIANT_MERCENARY_BB2020,
      { ...GIANT_MERCENARY_BB2020, move: 5 },
    ]);

    expect(() => service.forPosition('Giant Mercenary')).toThrow(
      'mercenaries: "Giant Mercenary" under rules set "BB2020" appears more than once',
    );
  });

  it('returns undefined for a mercenary position with no curated entry at all', () => {
    withMercenaries([GIANT_MERCENARY_BB2020]);

    expect(service.forPosition('Bogus Mercenary')).toBeUndefined();
  });

  it('returns an empty table when mercenaries is not set', () => {
    withMercenaries(undefined);

    expect(service.forPosition('Giant Mercenary')).toBeUndefined();
  });

  it('returns the curated characteristics for a known position and rules set', () => {
    withMercenaries([GIANT_MERCENARY_BB2020]);

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
    withMercenaries([GIANT_MERCENARY_BB2020]);

    expect(
      service.forPositionAndRulesSet({
        positionName: 'Giant Mercenary',
        rulesSetName: 'BB2025',
      }),
    ).toBeUndefined();
  });

  it('returns undefined for an unknown position under a known rules set', () => {
    withMercenaries([GIANT_MERCENARY_BB2020]);

    expect(
      service.forPositionAndRulesSet({
        positionName: 'Bogus Mercenary',
        rulesSetName: 'BB2020',
      }),
    ).toBeUndefined();
  });

  it('throws when mercenaries is not an array', () => {
    withMercenaries({ not: 'an array' });

    expect(() => service.forPosition('Giant Mercenary')).toThrow(
      'mercenaries in import-tp-config.json5 must be an array',
    );
  });

  it('throws when an entry is not an object', () => {
    withMercenaries(['Giant Mercenary']);

    expect(() => service.forPosition('Giant Mercenary')).toThrow(
      'MERCENARY_CHARACTERISTICS[0] must be an object',
    );
  });

  it('throws when positionName is empty', () => {
    withMercenaries([{ ...GIANT_MERCENARY_BB2020, positionName: '' }]);

    expect(() => service.forPosition('Giant Mercenary')).toThrow(
      'MERCENARY_CHARACTERISTICS[0].positionName must be a non-empty string',
    );
  });

  it('throws when rulesSetName is empty', () => {
    withMercenaries([{ ...GIANT_MERCENARY_BB2020, rulesSetName: '' }]);

    expect(() => service.forPosition('Giant Mercenary')).toThrow(
      'MERCENARY_CHARACTERISTICS[0].rulesSetName must be a non-empty string',
    );
  });

  it('throws when a characteristic is not a number', () => {
    withMercenaries([{ ...GIANT_MERCENARY_BB2020, move: 'six' }]);

    expect(() => service.forPosition('Giant Mercenary')).toThrow(
      'MERCENARY_CHARACTERISTICS[0].move must be a positive whole number',
    );
  });
});
