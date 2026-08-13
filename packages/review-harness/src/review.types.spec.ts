import { describe, expect, it } from 'vitest';

import { REVIEW_SOURCES } from './review.types';

describe('REVIEW_SOURCES', () => {
  it('lists every source in the order the report presents them', () => {
    expect(REVIEW_SOURCES).toEqual(['bbl', 'tp']);
  });
});
