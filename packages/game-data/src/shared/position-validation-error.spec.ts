import { describe, expect, it } from 'vitest';

import { PositionValidationError } from './position-validation-error';
import { SyncBatchValidationError } from './sync-batch-validation-error';

describe('PositionValidationError', () => {
  it('is a sync batch validation error carrying its message and its own name', () => {
    const error = new PositionValidationError('Position 1 does not exist');
    expect(error).toBeInstanceOf(SyncBatchValidationError);
    expect(error.message).toBe('Position 1 does not exist');
    expect(error.name).toBe('PositionValidationError');
  });
});
