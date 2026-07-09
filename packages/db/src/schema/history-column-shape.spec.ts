import { describe, expect, it } from 'vitest';

import {
  deriveHistoryColumnShapes,
  foldHistoryColumn,
} from './history-column-shape';

describe('foldHistoryColumn', () => {
  it('keeps a column unchanged when previous and current match exactly', () => {
    const shape = { name: 'name', sqlType: 'varchar(255)', notNull: true };
    expect(foldHistoryColumn(shape, shape)).toEqual(shape);
  });

  it('adds a brand new column as-is', () => {
    const current = {
      name: 'nickname',
      sqlType: 'varchar(100)',
      notNull: false,
    };
    expect(foldHistoryColumn(undefined, current)).toEqual(current);
  });

  it('keeps a removed column, forced nullable', () => {
    const previous = { name: 'legacy_flag', sqlType: 'boolean', notNull: true };
    expect(foldHistoryColumn(previous, undefined)).toEqual({
      name: 'legacy_flag',
      sqlType: 'boolean',
      notNull: false,
    });
  });

  it('widens a varchar length increase', () => {
    const previous = { name: 'name', sqlType: 'varchar(255)', notNull: true };
    const current = { name: 'name', sqlType: 'varchar(300)', notNull: true };
    expect(foldHistoryColumn(previous, current)).toEqual({
      name: 'name',
      sqlType: 'varchar(300)',
      notNull: true,
    });
  });

  it('keeps the wider varchar length when the tracked column narrows', () => {
    const previous = { name: 'name', sqlType: 'varchar(255)', notNull: true };
    const current = { name: 'name', sqlType: 'varchar(100)', notNull: true };
    expect(foldHistoryColumn(previous, current)).toEqual({
      name: 'name',
      sqlType: 'varchar(255)',
      notNull: true,
    });
  });

  it('widens a numeric precision increase', () => {
    const previous = { name: 'amount', sqlType: 'numeric(5,2)', notNull: true };
    const current = { name: 'amount', sqlType: 'numeric(8,2)', notNull: true };
    expect(foldHistoryColumn(previous, current)).toEqual({
      name: 'amount',
      sqlType: 'numeric(8,2)',
      notNull: true,
    });
  });

  it('keeps the previous type when the type family changes entirely', () => {
    const previous = { name: 'id', sqlType: 'integer', notNull: true };
    const current = { name: 'id', sqlType: 'bigint', notNull: true };
    expect(foldHistoryColumn(previous, current)).toEqual({
      name: 'id',
      sqlType: 'integer',
      notNull: true,
    });
  });

  it('adopts the current notNull, not the previous one', () => {
    const previous = { name: 'name', sqlType: 'varchar(255)', notNull: true };
    const current = { name: 'name', sqlType: 'varchar(255)', notNull: false };
    expect(foldHistoryColumn(previous, current)).toEqual({
      name: 'name',
      sqlType: 'varchar(255)',
      notNull: false,
    });
  });
});

describe('deriveHistoryColumnShapes', () => {
  it('folds every column across the union of previous and current names', () => {
    const current = [
      { name: 'name', sqlType: 'varchar(300)', notNull: true },
      { name: 'nickname', sqlType: 'varchar(50)', notNull: false },
    ];
    const previous = [
      { name: 'name', sqlType: 'varchar(255)', notNull: true },
      { name: 'legacy_flag', sqlType: 'boolean', notNull: true },
    ];
    expect(deriveHistoryColumnShapes(current, previous)).toEqual([
      { name: 'name', sqlType: 'varchar(300)', notNull: true },
      { name: 'legacy_flag', sqlType: 'boolean', notNull: false },
      { name: 'nickname', sqlType: 'varchar(50)', notNull: false },
    ]);
  });

  it('returns exactly the current shapes when there is no previous state', () => {
    const current = [{ name: 'name', sqlType: 'varchar(255)', notNull: true }];
    expect(deriveHistoryColumnShapes(current, [])).toEqual(current);
  });
});
