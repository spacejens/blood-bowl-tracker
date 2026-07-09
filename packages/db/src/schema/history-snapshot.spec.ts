import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readPreviousColumnShapes } from './history-snapshot';

describe('readPreviousColumnShapes', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty array when the migrations directory does not exist', () => {
    expect(
      readPreviousColumnShapes('/nonexistent/path', 'game_data', 'coaches'),
    ).toEqual([]);
  });

  it('returns an empty array when no migration has a snapshot.json', () => {
    dir = mkdtempSync(join(tmpdir(), 'history-snapshot-'));
    mkdirSync(join(dir, '20260101000000_empty'));
    expect(readPreviousColumnShapes(dir, 'game_data', 'coaches')).toEqual([]);
  });

  it('reads columns for the requested table from the most recent snapshot', () => {
    dir = mkdtempSync(join(tmpdir(), 'history-snapshot-'));

    const older = join(dir, '20260101000000_first');
    mkdirSync(older);
    writeFileSync(
      join(older, 'snapshot.json'),
      JSON.stringify({
        ddl: [
          {
            entityType: 'columns',
            schema: 'game_data',
            table: 'coaches',
            name: 'name',
            type: 'varchar(255)',
            notNull: true,
          },
        ],
      }),
    );

    const newer = join(dir, '20260102000000_second');
    mkdirSync(newer);
    writeFileSync(
      join(newer, 'snapshot.json'),
      JSON.stringify({
        ddl: [
          {
            entityType: 'columns',
            schema: 'game_data',
            table: 'coaches',
            name: 'name',
            type: 'varchar(300)',
            notNull: true,
          },
          {
            entityType: 'columns',
            schema: 'game_data',
            table: 'coaches',
            name: 'nickname',
            type: 'varchar(50)',
            notNull: false,
          },
          {
            entityType: 'tables',
            schema: 'game_data',
            name: 'coaches',
          },
        ],
      }),
    );

    expect(readPreviousColumnShapes(dir, 'game_data', 'coaches')).toEqual([
      { name: 'name', sqlType: 'varchar(300)', notNull: true },
      { name: 'nickname', sqlType: 'varchar(50)', notNull: false },
    ]);
  });

  it('ignores columns from other tables and schemas', () => {
    dir = mkdtempSync(join(tmpdir(), 'history-snapshot-'));
    const folder = join(dir, '20260101000000_only');
    mkdirSync(folder);
    writeFileSync(
      join(folder, 'snapshot.json'),
      JSON.stringify({
        ddl: [
          {
            entityType: 'columns',
            schema: 'game_data',
            table: 'teams',
            name: 'name',
            type: 'varchar(255)',
            notNull: true,
          },
          {
            entityType: 'columns',
            schema: 'other_schema',
            table: 'coaches',
            name: 'name',
            type: 'varchar(255)',
            notNull: true,
          },
        ],
      }),
    );
    expect(readPreviousColumnShapes(dir, 'game_data', 'coaches')).toEqual([]);
  });
});
