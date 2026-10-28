import { describe, expect, it } from 'vitest';

import { AdvancementCostValidationError } from './advancement-cost-validation-error';
import { SyncBatchValidationError } from './sync-batch-validation-error';

describe('AdvancementCostValidationError', () => {
  it('is a sync batch validation error carrying its message and its own name', () => {
    const error = new AdvancementCostValidationError(
      'Rules set 7 does not exist',
    );
    expect(error).toBeInstanceOf(SyncBatchValidationError);
    expect(error.message).toBe('Rules set 7 does not exist');
    expect(error.name).toBe('AdvancementCostValidationError');
  });
});
