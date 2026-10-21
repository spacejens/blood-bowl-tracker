import { describe, expect, it } from 'vitest';

import { SppAwardValueValidationError } from './spp-award-value-validation-error';
import { SyncBatchValidationError } from './sync-batch-validation-error';

describe('SppAwardValueValidationError', () => {
  it('is a sync batch validation error carrying its message and its own name', () => {
    const error = new SppAwardValueValidationError('Race 7 does not exist');
    expect(error).toBeInstanceOf(SyncBatchValidationError);
    expect(error.message).toBe('Race 7 does not exist');
    expect(error.name).toBe('SppAwardValueValidationError');
  });
});
