import { SPP_EARNING_ACTION_TYPES } from '@blood-bowl-tracker/domain-enums';
import { describe, expect, it } from 'vitest';

import {
  CASUALTY_CAUSED_TYPES,
  CASUALTY_SUFFERED_TYPES,
  DEATH_SUFFERED_TYPES,
  LASTING_INJURY_SUFFERED_TYPES,
  SERIOUS_INJURY_SUFFERED_TYPES,
} from './match-event-types';

describe('consequence type sets', () => {
  // A prevented casualty must never be counted as a real one. Every
  // consequence-role count filters with `inArray(consequenceType, <set>)`, so
  // keeping 'casualty_avoided' out of every set is the whole guarantee.
  it.each([
    ['CASUALTY_SUFFERED_TYPES', CASUALTY_SUFFERED_TYPES],
    ['SERIOUS_INJURY_SUFFERED_TYPES', SERIOUS_INJURY_SUFFERED_TYPES],
    ['LASTING_INJURY_SUFFERED_TYPES', LASTING_INJURY_SUFFERED_TYPES],
    ['DEATH_SUFFERED_TYPES', DEATH_SUFFERED_TYPES],
  ])('excludes casualty_avoided from %s', (_name, types) => {
    expect(types).not.toContain('casualty_avoided');
  });

  it('still counts a real death as a suffered casualty', () => {
    expect(CASUALTY_SUFFERED_TYPES).toContain('death');
  });
});

describe('CASUALTY_CAUSED_TYPES and SPP_EARNING_ACTION_TYPES', () => {
  it('every casualty-causing action type earns SPP', () => {
    expect(SPP_EARNING_ACTION_TYPES).toEqual(
      expect.arrayContaining([...CASUALTY_CAUSED_TYPES]),
    );
  });

  it('foul neither causes a casualty nor earns SPP', () => {
    expect(CASUALTY_CAUSED_TYPES).not.toContain('foul');
    expect(SPP_EARNING_ACTION_TYPES).not.toContain('foul');
  });
});
