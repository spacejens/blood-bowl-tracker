import { describe, expect, it } from 'vitest';

import { PositionSkillCategoryValidationError } from './position-skill-category-validation-error';
import { SyncBatchValidationError } from './sync-batch-validation-error';

describe('PositionSkillCategoryValidationError', () => {
  it('is a sync batch validation error carrying its message and its own name', () => {
    const error = new PositionSkillCategoryValidationError('nope');
    expect(error).toBeInstanceOf(SyncBatchValidationError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('nope');
    expect(error.name).toBe('PositionSkillCategoryValidationError');
  });
});
