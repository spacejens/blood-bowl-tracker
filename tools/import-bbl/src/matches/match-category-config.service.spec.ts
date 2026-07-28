import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { EraConfig } from '../eras/era-config.service';
import { EraConfigService } from '../eras/era-config.service';
import { MatchCategoryConfigService } from './match-category-config.service';

describe('MatchCategoryConfigService', () => {
  let service: MatchCategoryConfigService;
  let eraConfig: MockProxy<EraConfigService>;

  beforeEach(async () => {
    eraConfig = mock<EraConfigService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        MatchCategoryConfigService,
        { provide: EraConfigService, useValue: eraConfig },
      ],
    }).compile();
    service = moduleRef.get(MatchCategoryConfigService);
  });

  const era = (categoryOverrides: unknown[]) =>
    ({ matches: { categoryOverrides } }) as unknown as EraConfig;

  it('returns an empty map when no era configures overrides', () => {
    eraConfig.getEras.mockReturnValue([{} as EraConfig]);
    expect(service.getCategoryOverrides().size).toBe(0);
  });

  it('flattens overrides across eras', () => {
    eraConfig.getEras.mockReturnValue([
      era([{ matchId: '1061', category: 'cup_final' }]),
      era([{ matchId: '939', category: 'cup_final' }]),
    ]);
    expect(service.getCategoryOverrides()).toEqual(
      new Map([
        ['1061', 'cup_final'],
        ['939', 'cup_final'],
      ]),
    );
  });

  it('rejects a duplicate match id across eras, naming both locations', () => {
    eraConfig.getEras.mockReturnValue([
      era([{ matchId: '1061', category: 'cup_final' }]),
      era([{ matchId: '1061', category: 'season_final' }]),
    ]);
    expect(() => service.getCategoryOverrides()).toThrow(
      /BBL_ERAS\[0\]\.matches\.categoryOverrides\[0\].*BBL_ERAS\[1\]\.matches\.categoryOverrides\[0\]/,
    );
  });

  it('rejects a non-object entry', () => {
    eraConfig.getEras.mockReturnValue([era(['1061'])]);
    expect(() => service.getCategoryOverrides()).toThrow(/must be an object/);
  });

  it('rejects a blank matchId', () => {
    eraConfig.getEras.mockReturnValue([
      era([{ matchId: ' ', category: 'cup_final' }]),
    ]);
    expect(() => service.getCategoryOverrides()).toThrow(
      /matchId must be a non-empty string/,
    );
  });

  it('rejects an unknown category', () => {
    eraConfig.getEras.mockReturnValue([
      era([{ matchId: '1061', category: 'grand_final' }]),
    ]);
    expect(() => service.getCategoryOverrides()).toThrow(
      /category must be one of/,
    );
  });
});
