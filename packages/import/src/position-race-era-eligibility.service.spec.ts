import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PositionRaceEraEligibilityService } from './position-race-era-eligibility.service';

describe('PositionRaceEraEligibilityService', () => {
  let service: PositionRaceEraEligibilityService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PositionRaceEraEligibilityService],
    }).compile();
    service = moduleRef.get(PositionRaceEraEligibilityService);
  });

  it('lets an explicit override win outright, even against a star player', () => {
    expect(
      service.isEligible({
        override: false,
        isStarPlayer: true,
        hasPositiveEvidence: true,
      }),
    ).toBe(false);
  });

  it('lets an override make an otherwise-unevidenced position available', () => {
    expect(
      service.isEligible({
        override: true,
        isStarPlayer: false,
        hasPositiveEvidence: false,
      }),
    ).toBe(true);
  });

  it('treats a star player as available with no other evidence', () => {
    expect(
      service.isEligible({
        override: undefined,
        isStarPlayer: true,
        hasPositiveEvidence: false,
      }),
    ).toBe(true);
  });

  it('treats an observed use as available', () => {
    expect(
      service.isEligible({
        override: undefined,
        isStarPlayer: false,
        hasPositiveEvidence: true,
      }),
    ).toBe(true);
  });

  it('is unavailable with no positive evidence at all', () => {
    expect(
      service.isEligible({
        override: undefined,
        isStarPlayer: false,
        hasPositiveEvidence: false,
      }),
    ).toBe(false);
  });
});
