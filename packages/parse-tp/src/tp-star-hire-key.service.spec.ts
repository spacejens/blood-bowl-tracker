import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpStarHireKeyService } from './tp-star-hire-key.service';

describe('TpStarHireKeyService', () => {
  let service: TpStarHireKeyService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpStarHireKeyService],
    }).compile();
    service = moduleRef.get(TpStarHireKeyService);
  });

  it('keys a hire by the hiring roster and the star', () => {
    expect(service.externalId({ rosterId: 168446, lineUpMasterId: 1122 })).toBe(
      'star-168446-1122',
    );
  });

  it('gives the same star hired by two rosters two keys', () => {
    expect(service.externalId({ rosterId: 1, lineUpMasterId: 1122 })).not.toBe(
      service.externalId({ rosterId: 2, lineUpMasterId: 1122 }),
    );
  });
});
