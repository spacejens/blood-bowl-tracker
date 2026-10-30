import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { players, playersHistory } from './players';

describe('players', () => {
  it('has a nullable integer unspent_spp column', () => {
    const column = getTableConfig(players).columns.find(
      (c) => c.name === 'unspent_spp',
    );
    expect(column?.getSQLType()).toBe('integer');
    // Nullable: NULL means "not known exactly", never an estimate.
    expect(column?.notNull).toBe(false);
  });

  it('tracks unspent_spp in the history table', () => {
    expect(
      getTableConfig(playersHistory).columns.some(
        (c) => c.name === 'unspent_spp',
      ),
    ).toBe(true);
  });
});
