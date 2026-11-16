import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { FeedSkillResolverService } from './feed-skill-resolver.service';
import { report } from './fill-plan.test-helpers';
import type { SkillNameRow } from './fill-plan.types';

const NAMES: SkillNameRow[] = [
  { skillId: 200, skillName: 'Dodge', nameId: 'Dodge' },
  { skillId: 300, skillName: 'Mighty Blow', nameId: 'Mighty Blow' },
  { skillId: 300, skillName: 'Mighty Blow', nameId: 'Mighty blow' },
];

describe('FeedSkillResolverService', () => {
  let service: FeedSkillResolverService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [FeedSkillResolverService],
    }).compile();
    service = moduleRef.get(FeedSkillResolverService);
  });

  it('resolves a reported skill by its Name id, keeping order, kind and cost', () => {
    expect(
      service.resolve({
        reports: [
          report(),
          report({
            selection: 'random',
            category: 'secondary',
            gain: { skill: 'Mighty blow' },
            sppCost: 8,
          }),
        ],
        skillNames: NAMES,
      }),
    ).toEqual([
      {
        kind: 'skill',
        skillId: 200,
        skillName: 'Dodge',
        nameId: 'Dodge',
        attributeValue: null,
        selection: 'chosen',
        category: 'primary',
        reportedCost: 6,
      },
      {
        kind: 'skill',
        skillId: 300,
        skillName: 'Mighty Blow',
        nameId: 'Mighty blow',
        attributeValue: null,
        selection: 'random',
        category: 'secondary',
        reportedCost: 8,
      },
    ]);
  });

  it('splits a variant off the skill name', () => {
    expect(
      service.resolve({
        reports: [report({ gain: { skill: 'Mighty Blow (+1)' } })],
        skillNames: NAMES,
      }),
    ).toEqual([
      expect.objectContaining({
        skillId: 300,
        nameId: 'Mighty Blow',
        attributeValue: '+1',
      }),
    ]);
  });

  it('prefers a skill whose Name id is the whole text', () => {
    expect(
      service.resolve({
        reports: [report({ gain: { skill: 'Dodge (x)' } })],
        skillNames: [
          ...NAMES,
          { skillId: 201, skillName: 'Dodge X', nameId: 'Dodge (x)' },
        ],
      }),
    ).toEqual([
      expect.objectContaining({ skillId: 201, attributeValue: null }),
    ]);
  });

  it('resolves a characteristic increase', () => {
    expect(
      service.resolve({
        reports: [
          report({
            selection: 'random',
            category: 'characteristics',
            gain: { characteristic: 'AG', delta: 1 },
            sppCost: 18,
          }),
        ],
        skillNames: NAMES,
      }),
    ).toEqual([
      {
        kind: 'characteristic',
        characteristic: 'ag',
        selection: 'random',
        reportedCost: 18,
      },
    ]);
  });

  it('resolves no reports to no steps', () => {
    expect(service.resolve({ reports: [], skillNames: NAMES })).toEqual([]);
  });

  it.each([
    ['an unknown skill', report({ gain: { skill: 'Juggle' } })],
    ['an unknown variant base', report({ gain: { skill: 'Juggle (+1)' } })],
    [
      'a characteristic change other than +1',
      report({
        category: 'characteristics',
        gain: { characteristic: 'MA', delta: 2 },
      }),
    ],
    [
      'a characteristic decrease',
      report({
        category: 'characteristics',
        gain: { characteristic: 'MA', delta: -1 },
      }),
    ],
    [
      'a characteristic under a skill category',
      report({ gain: { characteristic: 'MA', delta: 1 } }),
    ],
    [
      'a skill under the characteristics category',
      report({ category: 'characteristics' }),
    ],
    ['a missing selection', report({ selection: null })],
    ['a missing category', report({ category: null })],
    ['a missing gain', report({ gain: null })],
    ['a missing cost', report({ sppCost: null })],
  ])('cannot resolve %s', (_name, unresolved) => {
    expect(
      service.resolve({ reports: [report(), unresolved], skillNames: NAMES }),
    ).toBeUndefined();
  });

  it('cannot resolve a Name id two skills share', () => {
    expect(
      service.resolve({
        reports: [report()],
        skillNames: [
          ...NAMES,
          { skillId: 201, skillName: 'Dodge too', nameId: 'Dodge' },
        ],
      }),
    ).toBeUndefined();
  });

  it('does not fall back to a variant split when the whole text is shared', () => {
    expect(
      service.resolve({
        reports: [report({ gain: { skill: 'Dodge (x)' } })],
        skillNames: [
          ...NAMES,
          { skillId: 201, skillName: 'Dodge X', nameId: 'Dodge (x)' },
          { skillId: 202, skillName: 'Dodge Y', nameId: 'Dodge (x)' },
        ],
      }),
    ).toBeUndefined();
  });

  it('cannot resolve a variant whose base two skills share', () => {
    expect(
      service.resolve({
        reports: [report({ gain: { skill: 'Mighty Blow (+1)' } })],
        skillNames: [
          ...NAMES,
          { skillId: 301, skillName: 'Mighty Blow too', nameId: 'Mighty Blow' },
        ],
      }),
    ).toBeUndefined();
  });

  it('trims the variant value', () => {
    expect(
      service.resolve({
        reports: [report({ gain: { skill: 'Mighty Blow ( +1 )' } })],
        skillNames: NAMES,
      }),
    ).toEqual([
      expect.objectContaining({ skillId: 300, attributeValue: '+1' }),
    ]);
  });

  it('cannot resolve a blank variant', () => {
    expect(
      service.resolve({
        reports: [report({ gain: { skill: 'Mighty Blow (  )' } })],
        skillNames: NAMES,
      }),
    ).toBeUndefined();
  });
});
