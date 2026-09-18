import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { SkillEntryService } from './skill-entry.service';

describe('SkillEntryService', () => {
  let service: SkillEntryService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [SkillEntryService],
    }).compile();
    service = moduleRef.get(SkillEntryService);
  });

  it('passes a plain skill name through', () => {
    expect(service.resolveSkillRefs('Block')).toEqual([{ name: 'Block' }]);
  });

  it('splits a trailing parenthetical into an attribute value', () => {
    expect(service.resolveSkillRefs('Loner (4+)')).toEqual([
      { name: 'Loner', attributeValue: '4+' },
    ]);
  });

  it('splits a parenthetical with no space before it', () => {
    expect(service.resolveSkillRefs('Mighty Blow(+1)')).toEqual([
      { name: 'Mighty Blow', attributeValue: '+1' },
    ]);
  });

  it('repairs a known garbled entry with a missing open paren', () => {
    expect(service.resolveSkillRefs('Secret Weapon 6+)')).toEqual([
      { name: 'Secret Weapon', attributeValue: '6+' },
    ]);
  });

  it('splits a known garbled entry that joined two skills', () => {
    expect(service.resolveSkillRefs('Leap Right Stuff')).toEqual([
      { name: 'Leap' },
      { name: 'Right Stuff' },
    ]);
  });

  it('drops a known garbled fragment that carries no skill', () => {
    expect(service.resolveSkillRefs('included in his price)')).toEqual([]);
  });
});
