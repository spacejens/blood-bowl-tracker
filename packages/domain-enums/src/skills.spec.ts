import { describe, expect, it } from 'vitest';

import { SKILL_CATEGORIES } from './skills';

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
