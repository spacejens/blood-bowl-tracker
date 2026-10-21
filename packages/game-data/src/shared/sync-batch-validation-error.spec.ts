import { describe, expect, it } from 'vitest';

import { SyncBatchValidationError } from './sync-batch-validation-error';

describe('SyncBatchValidationError', () => {
  it('is an Error carrying its message', () => {
    const error = new SyncBatchValidationError('Entry 3 is not valid');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Entry 3 is not valid');
  });
});
