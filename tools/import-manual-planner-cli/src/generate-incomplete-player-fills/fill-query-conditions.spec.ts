import { or } from '@blood-bowl-tracker/db';
import { CONSEQUENCE_TYPES } from '@blood-bowl-tracker/domain-enums';
import { INCOMPLETE_PLAYER_CRITERIA } from '@blood-bowl-tracker/game-data';
import { describe, expect, it } from 'vitest';

import { renderSql } from './fill-query.test-helpers';
import {
  INCOMPLETE_PLAYER,
  STAT_REDUCTION_CHARACTERISTIC,
  STAT_REDUCTION_TYPES,
  TP_NON_STAR_PLAYER,
} from './fill-query-conditions';

/** SQL text with parentheses and whitespace dropped, for comparing structure. */
const bare = (text: string): string => text.replace(/[()\s]/g, '');

describe('fill query conditions', () => {
  it('ORs exactly the INCOMPLETE_PLAYER_CRITERIA, in order', () => {
    const ours = renderSql(INCOMPLETE_PLAYER);
    const theirs = renderSql(or(...INCOMPLETE_PLAYER_CRITERIA));
    expect(bare(ours.sql)).toBe(bare(theirs.sql));
    expect(ours.params).toEqual(theirs.params);
    expect(ours.sql.startsWith('(')).toBe(true);
  });

  it('selects non-star players by their tourplay.net system', () => {
    const rendered = renderSql(TP_NON_STAR_PLAYER);
    expect(rendered.sql).toContain('"external_systems"."name" = $1');
    expect(rendered.sql).toContain('"positions"."is_star_player" = $2');
    expect(rendered.params).toEqual(['tourplay.net', false]);
  });

  it('lists every stat-reduction consequence type', () => {
    expect(STAT_REDUCTION_TYPES).toEqual(
      CONSEQUENCE_TYPES.filter((type) => type.startsWith('stat_reduction_')),
    );
  });

  it('names each stat reduction by its characteristic key', () => {
    expect(STAT_REDUCTION_CHARACTERISTIC).toEqual({
      stat_reduction_ma: 'ma',
      stat_reduction_st: 'st',
      stat_reduction_ag: 'ag',
      stat_reduction_pa: 'pa',
      stat_reduction_av: 'av',
    });
  });
});
