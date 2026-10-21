import { describe, expect, it } from 'vitest';

import { KeywordValidationError } from './keyword-validation-error';
import { SyncBatchValidationError } from './sync-batch-validation-error';

describe('KeywordValidationError', () => {
  it('is a sync batch validation error carrying its message and its own name', () => {
    const error = new KeywordValidationError('nope');
    expect(error).toBeInstanceOf(SyncBatchValidationError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('nope');
    expect(error.name).toBe('KeywordValidationError');
  });
});
