import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpOfficialListingPrecedenceService } from './tp-official-listing-precedence.service';

describe('TpOfficialListingPrecedenceService', () => {
  let service: TpOfficialListingPrecedenceService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpOfficialListingPrecedenceService],
    }).compile();
    service = moduleRef.get(TpOfficialListingPrecedenceService);
  });

  it.each([
    {
      name: 'official replaces legacy',
      currentIsOfficial: false,
      candidateIsOfficial: true,
      expected: true,
    },
    {
      name: 'a later official replaces an earlier official',
      currentIsOfficial: true,
      candidateIsOfficial: true,
      expected: true,
    },
    {
      name: 'a later legacy replaces an earlier legacy',
      currentIsOfficial: false,
      candidateIsOfficial: false,
      expected: true,
    },
    {
      name: 'legacy never replaces official',
      currentIsOfficial: true,
      candidateIsOfficial: false,
      expected: false,
    },
  ])('$name', ({ currentIsOfficial, candidateIsOfficial, expected }) => {
    expect(
      service.replaces({
        current: { isOfficial: currentIsOfficial },
        candidate: { isOfficial: candidateIsOfficial },
      }),
    ).toBe(expected);
  });
});
