import { describe, expect, expectTypeOf, it } from 'vitest';

import type { PlayerSkillSource, SkillCategory } from './skills';
import { PLAYER_SKILL_SOURCES, SKILL_CATEGORIES } from './skills';

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

describe('PLAYER_SKILL_SOURCES', () => {
  it('lists every source a player skill can have, in declared order', () => {
    expect(PLAYER_SKILL_SOURCES).toEqual([
      'starting',
      'advancement',
      'chosen',
      'random',
    ]);
  });

  it('has no duplicate values', () => {
    expect(new Set(PLAYER_SKILL_SOURCES).size).toBe(
      PLAYER_SKILL_SOURCES.length,
    );
  });

  it('types PlayerSkillSource as exactly its listed values', () => {
    expectTypeOf<PlayerSkillSource>().toEqualTypeOf<
      'starting' | 'advancement' | 'chosen' | 'random'
    >();
  });
});
