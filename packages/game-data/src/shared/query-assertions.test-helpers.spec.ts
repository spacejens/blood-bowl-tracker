import { players, teamEras } from '@blood-bowl-tracker/db';
import { and, eq, inArray } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import {
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from './query-assertions.test-helpers';

describe('query-assertions test helpers', () => {
  it('firstCallArg returns the recorded argument', () => {
    const fn = vi.fn();
    fn('a', 'b');
    expect(firstCallArg(fn)).toBe('a');
    expect(firstCallArg(fn, 0, 1)).toBe('b');
  });

  it('extractFilterValues recovers a single eq() literal', () => {
    // teamEras.eraId is an integer column, so drizzle stores the Param's
    // value as a number, not a string — assert the real runtime value.
    expect(extractFilterValues(eq(teamEras.eraId, 20))).toBe(20);
  });

  it('extractFilterValues recovers an inArray() list', () => {
    expect(extractFilterValues(inArray(players.name, ['a', 'b']))).toEqual([
      'a',
      'b',
    ]);
  });

  it('extractJoinColumns recovers both columns of a join condition', () => {
    const cols = extractJoinColumns(eq(teamEras.id, players.teamEraId));
    expect(cols).toHaveLength(2);
    // Adjust to the real physical names emitted by the schema.
    expect(cols).toContain('team_eras.id');
    expect(cols).toContain('players.team_era_id');
  });

  it('extractJoinColumns walks an and() of two conditions', () => {
    const cols = extractJoinColumns(
      and(eq(teamEras.id, players.teamEraId), eq(teamEras.eraId, 20)),
    );
    expect(cols).toContain('team_eras.id');
    expect(cols).toContain('players.team_era_id');
  });
});
