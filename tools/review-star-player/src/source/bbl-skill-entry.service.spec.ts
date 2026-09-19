import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { BblSkillEntryService } from './bbl-skill-entry.service';

describe('BblSkillEntryService', () => {
  let service: BblSkillEntryService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [BblSkillEntryService],
    }).compile();
    service = moduleRef.get(BblSkillEntryService);
  });

  it('splits a comma-separated cell into one ref per skill', () => {
    expect(service.parseCell('Block, Dodge, Tackle')).toEqual([
      { name: 'Block', attributeValue: null },
      { name: 'Dodge', attributeValue: null },
      { name: 'Tackle', attributeValue: null },
    ]);
  });

  it('splits a trailing parenthetical into an attribute value', () => {
    expect(service.parseCell('Loner (4+)')).toEqual([
      { name: 'Loner', attributeValue: '4+' },
    ]);
  });

  it('splits a parenthetical written without a space before it', () => {
    expect(service.parseCell('Mighty Blow(+1)')).toEqual([
      { name: 'Mighty Blow', attributeValue: '+1' },
    ]);
  });

  it('collapses non-breaking spaces and runs of whitespace', () => {
    expect(service.parseCell('Thick Skull ,  Block')).toEqual([
      { name: 'Thick Skull', attributeValue: null },
      { name: 'Block', attributeValue: null },
    ]);
  });

  it('returns no refs for a blank cell', () => {
    expect(service.parseCell('  ')).toEqual([]);
  });

  it('keeps a garbled entry verbatim rather than repairing it', () => {
    // The importer repairs known garbled entries; this tool must show what
    // the page actually says, because that repair is under review.
    expect(service.parseCell('Secret Weapon 6+)')).toEqual([
      { name: 'Secret Weapon 6+)', attributeValue: null },
    ]);
  });
});
