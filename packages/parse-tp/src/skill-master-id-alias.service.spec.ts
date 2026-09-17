import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  skillMasterIdAliasById,
  SkillMasterIdAliasService,
} from './skill-master-id-alias.service';

describe('SkillMasterIdAliasService', () => {
  let service: SkillMasterIdAliasService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [SkillMasterIdAliasService],
    }).compile();
    service = moduleRef.get(SkillMasterIdAliasService);
  });

  it.each(Object.entries(skillMasterIdAliasById))(
    'aliases skillMasterId %s to %s',
    (skillMasterId, expected) => {
      expect(service.decode(Number(skillMasterId))).toBe(expected);
    },
  );

  it('decodes a skillMasterId that is not in the table to undefined', () => {
    expect(service.decode(87)).toBeUndefined();
  });

  it('has a decode test for every known alias (guards against silent shrinkage of the id map)', () => {
    expect(Object.keys(skillMasterIdAliasById)).toHaveLength(9);
  });
});
