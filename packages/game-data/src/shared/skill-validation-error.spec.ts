import { describe, expect, it } from 'vitest';

import { SkillValidationError } from './skill-validation-error';
import { SyncBatchValidationError } from './sync-batch-validation-error';

describe('SkillValidationError', () => {
  it('is a sync batch validation error carrying its message', () => {
    const error = new SkillValidationError('Skill 7 is not available');
    expect(error).toBeInstanceOf(SyncBatchValidationError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Skill 7 is not available');
  });
});
