import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { SkillMasterNamesParserService } from './skill-master-names-parser.service';

describe('SkillMasterNamesParserService', () => {
  let service: SkillMasterNamesParserService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [SkillMasterNamesParserService],
    }).compile();
    service = moduleRef.get(SkillMasterNamesParserService);
  });

  it('finds embedded skillMaster names at any depth', () => {
    const names = service.extract({
      roster: {
        lineUps: [
          {
            skills: [
              {
                skillMasterId: 87,
                skillMaster: { id: 87, name: 'Dodge', type: 1, ruleSet: 20 },
              },
            ],
          },
        ],
      },
    });

    expect(names).toEqual(new Map([[87, { name: 'Dodge', isElite: false }]]));
  });

  it("reads BB2025's isElite marker off the skillMaster", () => {
    const names = service.extract({
      skills: [
        {
          skillMaster: { id: 220, name: 'Block', ruleSet: 25, isElite: true },
        },
      ],
    });

    expect(names).toEqual(new Map([[220, { name: 'Block', isElite: true }]]));
  });

  it('keeps isElite once any embedding of the same id marks it elite', () => {
    // TP embeds the same skill master both in full and as a partial record
    // that omits ruleSet and isElite; the partial one must not clear the flag.
    const names = service.extract({
      a: {
        skillMaster: { id: 220, name: 'Block', ruleSet: 25, isElite: true },
      },
      b: { skillMaster: { id: 220, name: 'Block' } },
    });

    expect(names.get(220)).toEqual({ name: 'Block', isElite: true });
  });

  it('keeps isElite when the elite embedding comes last', () => {
    const names = service.extract({
      a: { skillMaster: { id: 220, name: 'Block' } },
      b: {
        skillMaster: { id: 220, name: 'Block', ruleSet: 25, isElite: true },
      },
    });

    expect(names.get(220)).toEqual({ name: 'Block', isElite: true });
  });

  it('ignores a skillMaster with no usable id or name', () => {
    const names = service.extract({
      a: { skillMaster: { id: 87 } },
      b: { skillMaster: { name: 'Dodge' } },
      c: { skillMaster: { id: '87', name: 'Dodge' } },
      d: { skillMaster: null },
    });

    expect(names.size).toBe(0);
  });

  it('returns an empty map for a body with no skills at all', () => {
    expect(service.extract({ matches: [] }).size).toBe(0);
  });

  it('returns an empty map for a non-object body', () => {
    expect(service.extract('nonsense').size).toBe(0);
  });
});
