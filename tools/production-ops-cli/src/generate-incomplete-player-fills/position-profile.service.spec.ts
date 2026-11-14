import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { PositionRulesSetRow, PositionSkillRow } from './fill-plan.types';
import { PositionProfileService } from './position-profile.service';

const row = (
  overrides: Partial<PositionRulesSetRow> = {},
): PositionRulesSetRow => ({
  positionRulesSetId: 10,
  positionId: 1,
  eraId: 4,
  rulesSetId: 7,
  line: { ma: 6, st: 3, ag: 3, pa: 4, av: 9 },
  formats: {
    ma: 'bare',
    st: 'bare',
    ag: 'plus',
    pa: 'plus_zero_legal',
    av: 'plus',
  },
  ...overrides,
});

const skill = (
  overrides: Partial<PositionSkillRow> = {},
): PositionSkillRow => ({
  positionRulesSetId: 10,
  skillId: 100,
  nameId: 'Block',
  attributeValue: null,
  ...overrides,
});

describe('PositionProfileService', () => {
  let service: PositionProfileService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PositionProfileService],
    }).compile();
    service = moduleRef.get(PositionProfileService);
  });

  it('returns the one row as a profile with its skills sorted by name', () => {
    expect(
      service.resolve({
        rows: [row()],
        skills: [
          skill({ skillId: 101, nameId: 'Dodge' }),
          skill({ skillId: 102, nameId: 'Loner', attributeValue: '4+' }),
          skill(),
        ],
      }),
    ).toEqual({
      line: { ma: 6, st: 3, ag: 3, pa: 4, av: 9 },
      formats: {
        ma: 'bare',
        st: 'bare',
        ag: 'plus',
        pa: 'plus_zero_legal',
        av: 'plus',
      },
      skills: [
        { skillId: 100, nameId: 'Block', attributeValue: null },
        { skillId: 101, nameId: 'Dodge', attributeValue: null },
        { skillId: 102, nameId: 'Loner', attributeValue: '4+' },
      ],
    });
  });

  it('accepts a position with no starting skills', () => {
    expect(service.resolve({ rows: [row()], skills: [] })?.skills).toEqual([]);
  });

  it('is missing when the era has no row for the position', () => {
    expect(service.resolve({ rows: [], skills: [] })).toBeUndefined();
  });

  it('accepts two rules sets that agree on everything', () => {
    const rows = [row(), row({ positionRulesSetId: 11, rulesSetId: 8 })];
    const skills = [skill(), skill({ positionRulesSetId: 11 })];

    expect(service.resolve({ rows, skills })?.line.ma).toBe(6);
  });

  it('is ambiguous when two rules sets differ in characteristics', () => {
    const rows = [
      row(),
      row({
        positionRulesSetId: 11,
        rulesSetId: 8,
        line: { ma: 7, st: 3, ag: 3, pa: 4, av: 9 },
      }),
    ];

    expect(service.resolve({ rows, skills: [] })).toBeUndefined();
  });

  it('is ambiguous when two rules sets differ in starting skills', () => {
    const rows = [row(), row({ positionRulesSetId: 11, rulesSetId: 8 })];

    expect(service.resolve({ rows, skills: [skill()] })).toBeUndefined();
  });

  it('is ambiguous when two rules sets differ in formats', () => {
    const rows = [
      row(),
      row({
        positionRulesSetId: 11,
        rulesSetId: 8,
        formats: {
          ma: 'bare',
          st: 'bare',
          ag: 'bare',
          pa: 'plus_zero_legal',
          av: 'plus',
        },
      }),
    ];

    expect(service.resolve({ rows, skills: [] })).toBeUndefined();
  });

  it('is uncertain when a starting skill has no Name-system id', () => {
    expect(
      service.resolve({ rows: [row()], skills: [skill({ nameId: null })] }),
    ).toBeUndefined();
  });
});
