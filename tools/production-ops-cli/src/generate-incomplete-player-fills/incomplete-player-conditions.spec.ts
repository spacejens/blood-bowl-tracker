import type { SQL } from '@blood-bowl-tracker/db/test-helpers';
import { PgDialect } from '@blood-bowl-tracker/db/test-helpers';
import { INCOMPLETE_PLAYER_CRITERIA } from '@blood-bowl-tracker/game-data';
import { describe, expect, it } from 'vitest';

import { INCOMPLETE_PLAYER_CONDITIONS } from './incomplete-player-fill.sql';

/** One drizzle criterion as bare SQL: params inlined, quotes, qualifiers and parentheses dropped. */
function bare(criterion: SQL): string {
  const query = new PgDialect().sqlToQuery(criterion);
  return query.sql
    .replace(/\$(\d+)/g, (_match, n: string) =>
      String(query.params[Number(n) - 1]),
    )
    .replace(/"game_data"\."players"\./g, '')
    .replace(/["()]/g, '')
    .trim();
}

describe('INCOMPLETE_PLAYER_CONDITIONS', () => {
  it('says in SQL exactly what INCOMPLETE_PLAYER_CRITERIA says, in the same order', () => {
    expect(
      INCOMPLETE_PLAYER_CRITERIA.map((criterion) => bare(criterion)),
    ).toEqual([...INCOMPLETE_PLAYER_CONDITIONS]);
  });
});
