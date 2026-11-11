import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpSkillRefMapperService } from './tp-skill-ref-mapper.service';

describe('TpSkillRefMapperService', () => {
  let service: TpSkillRefMapperService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpSkillRefMapperService],
    }).compile();
    service = moduleRef.get(TpSkillRefMapperService);
  });

  describe('skillRef', () => {
    it('carries only the id when the skill has no attribute', () => {
      expect(service.skillRef({ skillMasterId: 220 })).toStrictEqual({
        skillMasterId: 220,
      });
    });

    it("splits the attribute out of TP's nested object", () => {
      expect(
        service.skillRef({
          skillMasterId: 54,
          skillAttributeMaster: { value: '4+', type: 0 },
        }),
      ).toStrictEqual({
        skillMasterId: 54,
        attributeValue: '4+',
        attributeType: 0,
      });
    });

    it('copies no field beyond the id and the attribute', () => {
      const gained = { skillMasterId: 7, id: 99, isRandom: true };
      expect(service.skillRef(gained)).toStrictEqual({ skillMasterId: 7 });
    });
  });

  describe('characteristics', () => {
    it("renames TP's abbreviated characteristics", () => {
      expect(
        service.characteristics({ ma: 5, st: 3, ag: 4, pa: 6, av: 9 }),
      ).toStrictEqual({
        move: 5,
        strength: 3,
        agility: 4,
        passing: 6,
        armour: 9,
      });
    });
  });
});
