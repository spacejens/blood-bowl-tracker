import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  playerAdvancements,
  playerAdvancementSourceEnum,
} from './player-advancements';

describe('player_advancements', () => {
  const config = getTableConfig(playerAdvancements);

  it('lives in the game_data schema under its own name', () => {
    expect(config.schema).toBe('game_data');
    expect(config.name).toBe('player_advancements');
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

  it('carries a not-null free-extra flag that defaults to false', () => {
    const column = config.columns.find((c) => c.name === 'is_free_extra');
    expect(column).toBeDefined();
    expect(column!.notNull).toBe(true);
    expect(column!.hasDefault).toBe(true);
    expect(column!.default).toBe(false);
  });

  it('uses the shared domain-enums source list', () => {
    expect(playerAdvancementSourceEnum.enumValues).toEqual([
      'starting',
      'advancement',
      'chosen',
      'random',
    ]);
  });

  it('is unique on (player, skill, attribute value) treating nulls as equal', () => {
    const constraint = config.uniqueConstraints.find(
      (c) =>
        c.name ===
        'player_advancements_player_id_skill_id_attribute_value_unique',
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
      (c) => c.name === 'player_advancements_starting_has_no_order',
    );
    expect(check).toBeDefined();
  });
});
