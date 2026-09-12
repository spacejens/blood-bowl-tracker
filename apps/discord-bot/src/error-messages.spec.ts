import { describe, expect, it } from 'vitest';

import * as messages from './error-messages';

describe('error-messages', () => {
  const values = Object.entries(messages);

  it('exports 125 message constants', () => {
    expect(values).toHaveLength(125);
  });

  it('gives every constant a non-empty string value', () => {
    for (const [name, value] of values) {
      expect(typeof value, name).toBe('string');
      expect((value as string).length, name).toBeGreaterThan(0);
    }
  });

  it('uses distinct text for every constant (one message per call site)', () => {
    const seen = new Map<string, string>();
    const allowedDuplicates = new Set([
      'DEBUG_FILTER_USAGE_NO_RESULTS_MESSAGE',
    ]);
    for (const [name, value] of values) {
      const prior = seen.get(value);
      if (prior && !allowedDuplicates.has(name)) {
        expect(prior, `${name} duplicates ${prior ?? ''}`).toBeUndefined();
      }
      seen.set(value, name);
    }
  });
});
