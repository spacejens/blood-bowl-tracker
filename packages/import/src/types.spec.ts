import { describe, expect, it } from 'vitest';

import { makeImportError, makeImportResult } from './types';

describe('makeImportResult', () => {
  it('creates a successful result', () => {
    const result = makeImportResult({ imported: 5, errors: [] });
    expect(result.success).toBe(true);
    expect(result.imported).toBe(5);
    expect(result.errors).toHaveLength(0);
  });

  it('creates a failed result when errors are present', () => {
    const error = makeImportError({ item: { id: 1 }, message: 'Unknown team' });
    const result = makeImportResult({ imported: 0, errors: [error] });
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('Unknown team');
  });
});
