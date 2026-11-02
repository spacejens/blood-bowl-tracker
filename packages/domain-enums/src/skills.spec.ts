import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  LearnableSkillCategory,
  PlayerSkillSource,
  SkillAccess,
  SkillCategory,
} from './skills';
import {
  LEARNABLE_SKILL_CATEGORIES,
  PLAYER_SKILL_SOURCES,
  SKILL_ACCESS_LEVELS,
  SKILL_CATEGORIES,
} from './skills';

describe('SKILL_CATEGORIES', () => {
  it('lists every skill category in schema order', () => {
    expect(SKILL_CATEGORIES).toEqual([
      'general',
      'agility',
      'passing',
      'strength',
      'mutation',
      'devious',
      'trait',
      'unique',
    ]);
  });

  it('has no duplicate values', () => {
    expect(new Set(SKILL_CATEGORIES).size).toBe(SKILL_CATEGORIES.length);
  });

  it('types SkillCategory as exactly its listed values', () => {
    expectTypeOf<SkillCategory>().toEqualTypeOf<
      | 'general'
      | 'agility'
      | 'passing'
      | 'strength'
      | 'mutation'
      | 'devious'
      | 'trait'
      | 'unique'
    >();
  });
});

describe('LEARNABLE_SKILL_CATEGORIES', () => {
  it('lists the categories an advancement can grant, in SKILL_CATEGORIES order', () => {
    expect(LEARNABLE_SKILL_CATEGORIES).toEqual([
      'general',
      'agility',
      'passing',
      'strength',
      'mutation',
      'devious',
    ]);
  });

  it('is SKILL_CATEGORIES without trait and unique', () => {
    expect(
      SKILL_CATEGORIES.filter((c) => c !== 'trait' && c !== 'unique'),
    ).toEqual([...LEARNABLE_SKILL_CATEGORIES]);
  });

  it('types LearnableSkillCategory as a subset of SkillCategory', () => {
    expectTypeOf<LearnableSkillCategory>().toMatchTypeOf<SkillCategory>();
  });
});

describe('SKILL_ACCESS_LEVELS', () => {
  it('lists primary before secondary', () => {
    expect(SKILL_ACCESS_LEVELS).toEqual(['primary', 'secondary']);
  });

  it('has no duplicate values', () => {
    expect(new Set(SKILL_ACCESS_LEVELS).size).toBe(SKILL_ACCESS_LEVELS.length);
  });

  it('types SkillAccess as exactly its listed values', () => {
    expectTypeOf<SkillAccess>().toEqualTypeOf<'primary' | 'secondary'>();
  });
});

describe('PLAYER_SKILL_SOURCES', () => {
  it('lists every source a player skill can have, in declared order', () => {
    expect(PLAYER_SKILL_SOURCES).toEqual([
      'starting',
      'advancement',
      'chosen',
      'random',
      'characteristic',
    ]);
  });

  it('has no duplicate values', () => {
    expect(new Set(PLAYER_SKILL_SOURCES).size).toBe(
      PLAYER_SKILL_SOURCES.length,
    );
  });

  it('types PlayerSkillSource as exactly its listed values', () => {
    expectTypeOf<PlayerSkillSource>().toEqualTypeOf<
      'starting' | 'advancement' | 'chosen' | 'random' | 'characteristic'
    >();
  });
});
