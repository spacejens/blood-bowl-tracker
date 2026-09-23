import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpNameExternalIdService } from './tp-name-external-id.service';

describe('TpNameExternalIdService', () => {
  let service: TpNameExternalIdService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpNameExternalIdService],
    }).compile();
    service = moduleRef.get(TpNameExternalIdService);
  });

  it("uses a team's bare name", () => {
    expect(service.forTeam('Da Boyz')).toBe('Da Boyz');
  });

  it("uses a star position's bare name", () => {
    expect(service.forStarPosition('Giant Mercenary')).toBe('Giant Mercenary');
  });
});
