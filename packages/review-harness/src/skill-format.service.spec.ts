import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { SkillFormatService } from './skill-format.service';

describe('SkillFormatService', () => {
  let service: SkillFormatService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [SkillFormatService],
    }).compile();
    service = moduleRef.get(SkillFormatService);
  });

  it('renders a plain skill as its bare name', () => {
    expect(service.format({ name: 'Block' })).toBe('Block');
  });

  it('appends an attribute value in parentheses', () => {
    expect(service.format({ name: 'Loner', attributeValue: '4+' })).toBe(
      'Loner (4+)',
    );
  });

  it('treats a null attribute value as no attribute value', () => {
    expect(service.format({ name: 'Block', attributeValue: null })).toBe(
      'Block',
    );
  });

  it('treats an empty attribute value as no attribute value', () => {
    expect(service.format({ name: 'Block', attributeValue: '' })).toBe('Block');
  });

  it('prefixes a unique skill with the star marker', () => {
    expect(
      service.format({
        name: 'Mighty Blow',
        attributeValue: 'Grombrindal',
        isUnique: true,
      }),
    ).toBe('★ Mighty Blow (Grombrindal)');
  });

  it('prefixes a randomly rolled gained skill with the dice marker', () => {
    expect(service.format({ name: 'Break Tackle', isRandom: true })).toBe(
      '⚄ Break Tackle',
    );
  });

  it('prefixes an elite gained skill with the diamond marker', () => {
    expect(service.format({ name: 'Guard', isElite: true })).toBe('◆ Guard');
  });

  it('renders the dice marker before the diamond when both apply', () => {
    expect(
      service.format({ name: 'Block', isRandom: true, isElite: true }),
    ).toBe('⚄ ◆ Block');
  });

  it('shows the unique marker alone even if other markers are passed', () => {
    // isUnique never co-occurs with isRandom/isElite in real data; this pins
    // the rendering down so it can never depend on caller sloppiness.
    expect(
      service.format({
        name: 'Catch of the Day',
        isUnique: true,
        isRandom: true,
        isElite: true,
      }),
    ).toBe('★ Catch of the Day');
  });

  it('renders explicit falses exactly like omitted flags', () => {
    expect(
      service.format({
        name: 'Dodge',
        isUnique: false,
        isRandom: false,
        isElite: false,
      }),
    ).toBe('Dodge');
  });
});
