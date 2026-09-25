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

  it("uses a coach's bare name", () => {
    expect(service.forCoach('Grimgor')).toBe('Grimgor');
  });

  it("uses a star position's bare name", () => {
    expect(service.forStarPosition('Giant Mercenary')).toBe('Giant Mercenary');
  });

  it("uses a race's bare name", () => {
    expect(service.forRace('Orc')).toBe('Orc');
  });

  it("scopes a regular position's name by its race", () => {
    expect(service.forPosition('Orc', 'Blitzer')).toBe('Orc: Blitzer');
  });

  it("uses a skill's bare name", () => {
    expect(service.forSkill('Block')).toBe('Block');
  });
});
