import { describe, expect, it } from 'vitest';

import {
  TROPHY_AWARD_RULE_KINDS,
  TROPHY_AWARD_RULE_MEASURES,
  TROPHY_AWARD_RULE_ROLES,
  TROPHY_RECIPIENT_KINDS,
} from './trophies';

describe('TROPHY_RECIPIENT_KINDS', () => {
  it('lists every trophy recipient kind in schema order', () => {
    expect(TROPHY_RECIPIENT_KINDS).toEqual(['team', 'player']);
  });

  it('has no duplicate values', () => {
    expect(new Set(TROPHY_RECIPIENT_KINDS).size).toBe(
      TROPHY_RECIPIENT_KINDS.length,
    );
  });
});

describe('TROPHY_AWARD_RULE_KINDS', () => {
  it('lists the two source-recorded kinds and the three computed kinds', () => {
    expect(TROPHY_AWARD_RULE_KINDS).toEqual([
      'direct_source',
      'manual',
      'max_count',
      'max_spp_sum',
      'career_threshold',
    ]);
  });
});

describe('TROPHY_AWARD_RULE_ROLES', () => {
  it('names the two match-event participants an award can go to', () => {
    expect(TROPHY_AWARD_RULE_ROLES).toEqual(['acting', 'consequence']);
  });
});

describe('TROPHY_AWARD_RULE_MEASURES', () => {
  it('names the two career aggregations', () => {
    expect(TROPHY_AWARD_RULE_MEASURES).toEqual(['event_count', 'spp_sum']);
  });
});
