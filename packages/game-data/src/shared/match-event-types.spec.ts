import { describe, expect, it } from 'vitest';

import {
  CASUALTY_SUFFERED_TYPES,
  LASTING_INJURY_SUFFERED_TYPES,
  SERIOUS_INJURY_SUFFERED_TYPES,
} from './match-event-types';

describe('match-event-types groupings', () => {
  it('includes stat_reduction_pa alongside the other stat reductions in every injury grouping', () => {
    for (const group of [
      CASUALTY_SUFFERED_TYPES,
      SERIOUS_INJURY_SUFFERED_TYPES,
      LASTING_INJURY_SUFFERED_TYPES,
    ]) {
      expect(group).toContain('stat_reduction_ma');
      expect(group).toContain('stat_reduction_st');
      expect(group).toContain('stat_reduction_ag');
      expect(group).toContain('stat_reduction_av');
      expect(group).toContain('stat_reduction_pa');
    }
  });
});
