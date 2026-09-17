import { describe, expect, it } from 'vitest';

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
});

describe('PLAYER_SKILL_SOURCES', () => {
  it('lists every way a player can come by a skill, in schema order', () => {
    expect(PLAYER_SKILL_SOURCES).toEqual(['starting', 'chosen', 'random']);
  });

  it('has no duplicate values', () => {
    expect(new Set(PLAYER_SKILL_SOURCES).size).toBe(
      PLAYER_SKILL_SOURCES.length,
    );
  });
});
