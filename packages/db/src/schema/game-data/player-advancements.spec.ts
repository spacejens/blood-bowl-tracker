import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  playerAdvancements,
  playerAdvancementSourceEnum,
  playerCharacteristicEnum,
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
    expect(byName.get('skill_id')?.notNull).toBe(false);
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
      'characteristic',
    ]);
  });

  it('allows a row with no skill, for a characteristic increase', () => {
    const byName = new Map(config.columns.map((c) => [c.name, c]));
    expect(byName.get('skill_id')?.notNull).toBe(false);
    expect(byName.get('characteristic')?.notNull).toBe(false);
  });

  it('carries not-null order-confirmed and removed flags defaulting to false', () => {
    for (const name of ['order_confirmed', 'removed']) {
      const column = config.columns.find((c) => c.name === name);
      expect(column, name).toBeDefined();
      expect(column!.notNull).toBe(true);
      expect(column!.default).toBe(false);
    }
  });

  it('uses the shared characteristic enum', () => {
    expect(playerCharacteristicEnum.enumName).toBe('player_characteristic');
    expect(playerCharacteristicEnum.enumValues).toEqual([
      'MA',
      'ST',
      'AG',
      'PA',
      'AV',
    ]);
  });

  it('keeps skill rows unique through two partial unique indexes', () => {
    const names = config.indexes.map((index) => index.config.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'player_advancements_skill_with_attribute_unique',
        'player_advancements_skill_without_attribute_unique',
      ]),
    );
    expect(config.uniqueConstraints).toEqual([]);
  });

  it.each([
    'player_advancements_starting_has_no_order',
    'player_advancements_skill_or_characteristic',
    'player_advancements_characteristic_has_no_skill_fields',
    'player_advancements_confirmed_has_order',
    'player_advancements_only_characteristic_removed',
  ])('declares the %s check', (name) => {
    expect(config.checks.map((c) => c.name)).toContain(name);
  });

  it('enforces that a starting row leaves advancementOrder unset', () => {
    const check = config.checks.find(
      (c) => c.name === 'player_advancements_starting_has_no_order',
    );
    expect(check).toBeDefined();
  });
});
