import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { playerSkills, playerSkillSourceEnum } from './player-skills';

describe('player_skills', () => {
  const config = getTableConfig(playerSkills);

  it('lives in the game_data schema under its own name', () => {
    expect(config.schema).toBe('game_data');
    expect(config.name).toBe('player_skills');
  });

  it('carries the source enum and the two nullable advancement columns', () => {
    const byName = new Map(config.columns.map((c) => [c.name, c]));
    expect(byName.get('source')?.notNull).toBe(true);
    expect(byName.get('player_id')?.notNull).toBe(true);
    expect(byName.get('skill_id')?.notNull).toBe(true);
    // Nullable: most skills carry no variant, and a starting skill has no
    // sequence at all.
    expect(byName.get('attribute_value')?.notNull).toBe(false);
    expect(byName.get('advancement_order')?.notNull).toBe(false);
  });

  it('uses the shared domain-enums source list', () => {
    expect(playerSkillSourceEnum.enumValues).toEqual([
      'starting',
      'chosen',
      'random',
    ]);
  });

  it('is unique on (player, skill, attribute value) treating nulls as equal', () => {
    const constraint = config.uniqueConstraints.find(
      (c) =>
        c.name === 'player_skills_player_id_skill_id_attribute_value_unique',
    );
    expect(constraint).toBeDefined();
    expect(constraint!.columns.map((c) => c.name)).toEqual([
      'player_id',
      'skill_id',
      'attribute_value',
    ]);
    // Postgres treats each NULL as distinct by default, which would silently
    // allow two identical no-variant rows for the same player.
    expect(constraint!.nullsNotDistinct).toBe(true);
  });

  it('enforces that a starting row leaves advancementOrder unset', () => {
    const check = config.checks.find(
      (c) => c.name === 'player_skills_starting_has_no_order',
    );
    expect(check).toBeDefined();
  });
});
